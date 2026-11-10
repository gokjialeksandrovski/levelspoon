"use server";

import { refresh } from "next/cache";

import { requireUserId } from "@/lib/auth/require-user";
import { db, type DbTransaction } from "@/lib/db";
import { todayLocalDateString } from "@/lib/date/day-bounds";

import { isValidRecipeName, mealMatchesRecipe } from "./recipes.utils";
import type { EarlierMeal } from "./recipes.utils";
import {
  EmptyRecipeError,
  InvalidRecipeNameError,
  MealNotFoundError,
  RecipeNotFoundError,
} from "./recipes.errors";
import {
  appendItemsToMeal,
  fetchMealItems,
  fetchMealItemsByMeal,
  fetchMealKcals,
  fetchMealNumbers,
  fetchOwnedMeal,
  fetchOwnedRecipe,
  fetchRecipeItems,
  fetchRecipeSummaries,
  fetchSiblingMealIds,
  insertRecipe,
  renameRecipeRow,
  replaceMealIngredients,
  replaceRecipeItems,
  setMealRecipe,
  softDeleteRecipe,
  touchRecipe,
  unlinkMealsFromRecipe,
  type AmountRow,
  type OwnedMeal,
  type RecipeSummary,
} from "./recipes.store";

// A missing meal or recipe refreshes too: the page then shows it gone rather
// than offering it again.
const refreshed = <Result>(result: Result): Result => {
  refresh();
  return result;
};

export type SaveRecipeResult =
  | { kind: "saved"; recipeId: string; name: string }
  | { kind: "invalid_name" }
  | { kind: "empty_meal" }
  | { kind: "meal_missing" }
  | { kind: "failed" };

/** The picker's feed: name, item count and live figures, most recently used
 * first. Private by construction - the store filters on the session user. */
export const listRecipes = async (): Promise<RecipeSummary[]> => {
  const userId = await requireUserId();
  return fetchRecipeSummaries(userId);
};

/**
 * Files the meal's live rows as a recipe and links the meal to it.
 *
 * The refusals travel as data. A thrown class would reach the sheet as a bare
 * Error, so the classes below never leave this module.
 */
export const saveMealAsRecipe = async (mealId: string, name: string): Promise<SaveRecipeResult> => {
  const userId = await requireUserId();
  try {
    if (!isValidRecipeName(name)) throw new InvalidRecipeNameError();
    const meal = await fetchOwnedMeal(userId, mealId);
    // Generic for a missing meal and for another user's meal alike: naming
    // the difference would confirm the row exists.
    if (!meal) throw new MealNotFoundError();
    const items = await fetchMealItems(mealId);
    if (items.length === 0) throw new EmptyRecipeError();

    const recipeId = await db.transaction(async (tx) => {
      const id = await insertRecipe(tx, userId, name);
      await replaceRecipeItems(tx, id, items);
      await setMealRecipe(tx, mealId, id);
      return id;
    });
    return refreshed({ kind: "saved", recipeId, name: name.trim() });
  } catch (error) {
    if (error instanceof InvalidRecipeNameError) return { kind: "invalid_name" };
    if (error instanceof MealNotFoundError) return refreshed({ kind: "meal_missing" });
    if (error instanceof EmptyRecipeError) return { kind: "empty_meal" };
    throw error;
  }
};

type EnterRecipeResult =
  | { kind: "entered"; addedCount: number }
  | { kind: "recipe_missing" }
  | { kind: "meal_missing" }
  | { kind: "failed" };

type RenameRecipeResult =
  | { kind: "renamed"; name: string }
  | { kind: "invalid_name" }
  | { kind: "recipe_missing" };

type DeleteRecipeResult = { kind: "deleted" } | { kind: "recipe_missing" };

/** Writes immediately - picking a recipe is the commit, and the meal page it
 * lands on is where anything about it gets changed. One transaction, so a
 * meal never ends up half-entered or linked to a recipe it does not hold. */
export const enterRecipe = async (mealId: string, recipeId: string): Promise<EnterRecipeResult> => {
  const userId = await requireUserId();
  try {
    const meal = await fetchOwnedMeal(userId, mealId);
    if (!meal) throw new MealNotFoundError();
    const recipe = await fetchOwnedRecipe(userId, recipeId);
    if (!recipe) throw new RecipeNotFoundError();
    const items = await fetchRecipeItems(recipeId);

    const addedCount = await db.transaction(async (tx) => {
      const count = await appendItemsToMeal(tx, mealId, items);
      await setMealRecipe(tx, mealId, recipeId);
      await touchRecipe(tx, recipeId);
      return count;
    });
    return refreshed({ kind: "entered", addedCount });
  } catch (error) {
    if (error instanceof MealNotFoundError) return refreshed({ kind: "meal_missing" });
    if (error instanceof RecipeNotFoundError) return refreshed({ kind: "recipe_missing" });
    throw error;
  }
};

export const renameRecipe = async (recipeId: string, name: string): Promise<RenameRecipeResult> => {
  const userId = await requireUserId();
  try {
    if (!isValidRecipeName(name)) throw new InvalidRecipeNameError();
    if (!(await fetchOwnedRecipe(userId, recipeId))) throw new RecipeNotFoundError();
    await db.transaction((tx) => renameRecipeRow(tx, recipeId, name));
    return refreshed({ kind: "renamed", name: name.trim() });
  } catch (error) {
    if (error instanceof InvalidRecipeNameError) return { kind: "invalid_name" };
    if (error instanceof RecipeNotFoundError) return refreshed({ kind: "recipe_missing" });
    throw error;
  }
};

/** Ownership check outside the transaction, same shape as renameRecipe: a
 * refusal here writes nothing, so there is nothing that needs to be atomic
 * with it. Unlink before soft-delete - a caller must never observe a
 * deleted recipe still linked from a meal. */
export const deleteRecipe = async (recipeId: string): Promise<DeleteRecipeResult> => {
  const userId = await requireUserId();
  if (!(await fetchOwnedRecipe(userId, recipeId))) {
    return refreshed({ kind: "recipe_missing" });
  }
  await db.transaction(async (tx) => {
    await unlinkMealsFromRecipe(tx, recipeId);
    await softDeleteRecipe(tx, recipeId);
  });
  return refreshed({ kind: "deleted" });
};

/**
 * Today's other meals from this meal's recipe, split by whether each still
 * matches it.
 *
 * Both halves are returned: a meal that has diverged is named in the prompt
 * and left alone, never silently excluded and never silently overwritten.
 * The kcal each would move is computed by the caller against its own draft -
 * this states what each meal totals now, which is the measured half.
 *
 * `fetchSiblingMealIds`' own `logDate` filter matches the *open* meal's day,
 * whatever day that is - it takes the day it's given and has no timezone of
 * its own. Genuinely-today is enforced here, where the timezone lives: a
 * linked meal is reachable by id regardless of its day, and the prompt this
 * feeds says "earlier today" verbatim, so a meal logged for yesterday must
 * offer nothing at all, before any sibling read.
 */
export const earlierMealsFromRecipe = async (mealId: string, timezone: string): Promise<EarlierMeal[]> => {
  const userId = await requireUserId();
  const meal = await fetchOwnedMeal(userId, mealId);
  if (!meal?.recipeId) {
    return [];
  }
  if (meal.logDate !== todayLocalDateString(timezone)) {
    return [];
  }
  const siblingIds = await fetchSiblingMealIds(userId, meal);
  if (siblingIds.length === 0) {
    return [];
  }

  const [recipeItemRows, numbers, kcals, siblingRows] = await Promise.all([
    fetchRecipeItems(meal.recipeId),
    fetchMealNumbers(userId, meal.logDate),
    fetchMealKcals(userId, siblingIds),
    fetchMealItemsByMeal(siblingIds),
  ]);

  return siblingIds.map((id) => ({
    mealId: id,
    mealNumber: numbers.get(id) ?? 0,
    currentKcal: kcals.get(id) ?? 0,
    matches: mealMatchesRecipe(siblingRows.get(id) ?? [], recipeItemRows),
  }));
};

export type SaveRecipeEditMode =
  | { kind: "new"; name: string }
  | { kind: "overwrite"; alsoUpdateMealIds: string[] };

export type SaveRecipeEditResult =
  | { kind: "saved"; recipeId: string; name: string; updatedMealNumbers: number[]; skippedMealNumbers: number[] }
  | { kind: "invalid_name" }
  | { kind: "empty_draft" }
  | { kind: "recipe_missing" }
  | { kind: "meal_missing" }
  | { kind: "failed" };

const draftIsWritable = (draft: readonly AmountRow[]): boolean =>
  draft.length > 0 && draft.every((item) => item.quantity > 0);

/** Which ticked meals may actually be rewritten. The tick was rendered from a
 * read that is now old, so every id is re-checked here against the recipe as
 * it stands before this save - the server never trusts the tick. */
const partitionTickedMeals = async (
  userId: string,
  meal: OwnedMeal,
  tickedIds: readonly string[],
  recipeItemRows: readonly AmountRow[],
): Promise<{ updatable: string[]; skipped: string[] }> => {
  const siblingIds = await fetchSiblingMealIds(userId, meal);
  // Deduped first: a client-sent duplicate must not rewrite a meal twice or
  // count it twice into updatedMealNumbers - the server never trusts the
  // client anywhere else in this feature. An id the prompt never offered -
  // another day's meal, another user's, or one invented by hand - is not
  // skipped, it is not there at all.
  const eligible = [...new Set(tickedIds)].filter((id) => siblingIds.includes(id));
  const rows = await fetchMealItemsByMeal(eligible);
  return eligible.reduce<{ updatable: string[]; skipped: string[] }>(
    (split, id) => {
      const target = mealMatchesRecipe(rows.get(id) ?? [], recipeItemRows) ? split.updatable : split.skipped;
      target.push(id);
      return split;
    },
    { updatable: [], skipped: [] },
  );
};

const numbersFor = (ids: readonly string[], numbers: Map<string, number>): number[] =>
  ids.map((id) => numbers.get(id) ?? 0);

/**
 * The transaction body itself, pulled out of saveRecipeEdit so that
 * function's own cyclomatic complexity stays under the linted threshold with
 * no eslint-disable. Writes the open meal's rows, then files or overwrites
 * the recipe, then rewrites the earlier meals that survived the re-check
 * `saveRecipeEdit` already computed.
 */
const writeRecipeEdit = async (
  tx: DbTransaction,
  userId: string,
  mealId: string,
  draft: AmountRow[],
  mode: SaveRecipeEditMode,
  meal: OwnedMeal,
  updatable: readonly string[],
): Promise<string> => {
  await replaceMealIngredients(tx, mealId, draft);
  if (mode.kind === "new") {
    const id = await insertRecipe(tx, userId, mode.name);
    await replaceRecipeItems(tx, id, draft);
    // Latest wins: the open meal is this new recipe's meal now.
    await setMealRecipe(tx, mealId, id);
    return id;
  }
  const id = meal.recipeId as string;
  await replaceRecipeItems(tx, id, draft);
  await touchRecipe(tx, id);
  for (const targetId of updatable) {
    await replaceMealIngredients(tx, targetId, draft);
  }
  return id;
};

/** Refuses a malformed request before any read - an empty or non-positive
 * draft, or (filing a new recipe) a blank name. */
const assertEditableDraft = (draft: readonly AmountRow[], mode: SaveRecipeEditMode): void => {
  if (!draftIsWritable(draft)) throw new EmptyRecipeError();
  if (mode.kind === "new" && !isValidRecipeName(mode.name)) throw new InvalidRecipeNameError();
};

/** The owned meal an edit targets, plus (for an overwrite) its owned
 * recipe's current name - both ownership checks a refusal never names the
 * row for. */
const resolveEditTarget = async (
  userId: string,
  mealId: string,
  mode: SaveRecipeEditMode,
): Promise<{ meal: OwnedMeal; existingName: string | undefined }> => {
  const meal = await fetchOwnedMeal(userId, mealId);
  if (!meal) throw new MealNotFoundError();
  if (mode.kind === "overwrite" && !meal.recipeId) throw new RecipeNotFoundError();
  const existingName = meal.recipeId ? (await fetchOwnedRecipe(userId, meal.recipeId))?.name : undefined;
  if (mode.kind === "overwrite" && existingName === undefined) throw new RecipeNotFoundError();
  return { meal, existingName };
};

/** Maps a refusal to its result shape; anything else is a real failure and
 * keeps propagating. Pulled out of saveRecipeEdit for the same complexity
 * reason writeRecipeEdit was. */
const mapSaveRecipeEditError = (error: unknown): SaveRecipeEditResult => {
  if (error instanceof EmptyRecipeError) return { kind: "empty_draft" };
  if (error instanceof InvalidRecipeNameError) return { kind: "invalid_name" };
  if (error instanceof MealNotFoundError) return refreshed({ kind: "meal_missing" });
  if (error instanceof RecipeNotFoundError) return refreshed({ kind: "recipe_missing" });
  throw error;
};

/**
 * Writes the open meal's rows, then files or overwrites the recipe, then
 * rewrites the earlier meals that survived the re-check. One transaction: a
 * recipe that moved without its meal, or a meal rewritten against a recipe
 * that then failed to save, are both half-states nothing here can explain.
 *
 * The retro-update is withheld outright when the open meal is not on today
 * (by `timezone`'s reckoning) - same reasoning as `earlierMealsFromRecipe`:
 * nothing was ever offered for a past day, so nothing here may be ticked
 * either, no matter what the caller sends. The recipe edit itself - the open
 * meal's own rows, and the recipe row - still saves normally; only the
 * retro-update is skipped, and silently, since naming meals that were never
 * offered would be noise.
 */
export const saveRecipeEdit = async (
  mealId: string,
  draft: AmountRow[],
  mode: SaveRecipeEditMode,
  timezone: string,
): Promise<SaveRecipeEditResult> => {
  const userId = await requireUserId();
  try {
    assertEditableDraft(draft, mode);
    const { meal, existingName } = await resolveEditTarget(userId, mealId, mode);
    const isToday = meal.logDate === todayLocalDateString(timezone);

    // Read the recipe's own current items before anything overwrites them -
    // partitionTickedMeals re-checks every ticked meal against these, and once
    // the recipe is overwritten there is nothing left to compare against: a
    // re-check done afterwards would silently pass every meal.
    const oldItems = meal.recipeId ? await fetchRecipeItems(meal.recipeId) : [];
    const [{ updatable, skipped }, numbers] = await Promise.all([
      mode.kind === "overwrite" && isToday
        ? partitionTickedMeals(userId, meal, mode.alsoUpdateMealIds, oldItems)
        : { updatable: [], skipped: [] },
      fetchMealNumbers(userId, meal.logDate),
    ]);

    const recipeId = await db.transaction((tx) => writeRecipeEdit(tx, userId, mealId, draft, mode, meal, updatable));

    return refreshed({
      kind: "saved",
      recipeId,
      name: mode.kind === "new" ? mode.name.trim() : (existingName as string),
      updatedMealNumbers: numbersFor(updatable, numbers),
      skippedMealNumbers: numbersFor(skipped, numbers),
    });
  } catch (error) {
    return mapSaveRecipeEditError(error);
  }
};
