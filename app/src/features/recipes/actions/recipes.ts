"use server";

import { requireUserId } from "@/lib/auth/require-user";
import { db } from "@/lib/db";

import { isValidRecipeName } from "./recipes.utils";
import {
  EmptyRecipeError,
  InvalidRecipeNameError,
  MealNotFoundError,
  RecipeNotFoundError,
} from "./recipes.errors";
import {
  appendItemsToMeal,
  fetchMealItems,
  fetchOwnedMeal,
  fetchOwnedRecipe,
  fetchRecipeItems,
  fetchRecipeSummaries,
  insertRecipe,
  renameRecipeRow,
  replaceRecipeItems,
  setMealRecipe,
  softDeleteRecipe,
  touchRecipe,
  unlinkMealsFromRecipe,
  type RecipeSummary,
} from "./recipes.store";

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
    return { kind: "saved", recipeId, name: name.trim() };
  } catch (error) {
    if (error instanceof InvalidRecipeNameError) return { kind: "invalid_name" };
    if (error instanceof MealNotFoundError) return { kind: "meal_missing" };
    if (error instanceof EmptyRecipeError) return { kind: "empty_meal" };
    throw error;
  }
};

export type EnterRecipeResult =
  | { kind: "entered"; addedCount: number }
  | { kind: "recipe_missing" }
  | { kind: "meal_missing" }
  | { kind: "failed" };

export type RenameRecipeResult =
  | { kind: "renamed"; name: string }
  | { kind: "invalid_name" }
  | { kind: "recipe_missing" };

export type DeleteRecipeResult = { kind: "deleted" } | { kind: "recipe_missing" };

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
    return { kind: "entered", addedCount };
  } catch (error) {
    if (error instanceof MealNotFoundError) return { kind: "meal_missing" };
    if (error instanceof RecipeNotFoundError) return { kind: "recipe_missing" };
    throw error;
  }
};

export const renameRecipe = async (recipeId: string, name: string): Promise<RenameRecipeResult> => {
  const userId = await requireUserId();
  try {
    if (!isValidRecipeName(name)) throw new InvalidRecipeNameError();
    if (!(await fetchOwnedRecipe(userId, recipeId))) throw new RecipeNotFoundError();
    await db.transaction((tx) => renameRecipeRow(tx, recipeId, name));
    return { kind: "renamed", name: name.trim() };
  } catch (error) {
    if (error instanceof InvalidRecipeNameError) return { kind: "invalid_name" };
    if (error instanceof RecipeNotFoundError) return { kind: "recipe_missing" };
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
    return { kind: "recipe_missing" };
  }
  await db.transaction(async (tx) => {
    await unlinkMealsFromRecipe(tx, recipeId);
    await softDeleteRecipe(tx, recipeId);
  });
  return { kind: "deleted" };
};
