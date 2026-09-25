// No "use server": every export takes a userId, and as a Server Action that
// would let a browser read or write any user's recipes. Only "use server"
// modules import this file (CLAUDE.md, "Server/client boundary"); they resolve
// the user themselves and hand it in. Same rule as weight.store.ts.
import { and, asc, desc, eq, inArray, isNull, ne, sql } from "drizzle-orm";

import { db, type DbTransaction } from "@/lib/db";
import { effectiveNutritionSelection } from "@/lib/db/effective-nutrition";
import { AI_ESTIMATE_ORIGIN, mealIngredients, meals, productOverrides, products, recipeItems, recipes } from "@/lib/db/schema";
import { toSearchText } from "@/lib/db/search-text";
import { ZERO_NUTRITION, addNutrition, productRowToNutritionValues } from "@/lib/nutrition/totals";
import { scaleNutrition } from "@/lib/nutrition/scale-per-serving";
import type { NutritionValues } from "@/types/nutrition";

/** One amount, in the shape both a meal row and a recipe item reduce to.
 * `quantity` is already a number: `numeric` reads back as a string, and every
 * comparison and sum downstream is arithmetic. */
export interface AmountRow {
  productId: string;
  quantity: number;
  quantityUnit: string;
  entryCount: number | null;
  entryUnit: string | null;
  /** Preserved from the row's own stored source when the caller has one to
   * preserve (the edit sheet's untouched rows); omitted when there isn't one
   * - a recipe item (recipe_items carries no source column) and a freshly
   * typed amount are both "manual", which appendItemsToMeal defaults to. */
  quantitySource?: "ai_estimated" | "manual";
}

export interface RecipeSummary {
  id: string;
  name: string;
  itemCount: number;
  total: NutritionValues;
  isAiEstimate: boolean;
}

export interface OwnedMeal {
  id: string;
  logDate: string;
  recipeId: string | null;
}

const toAmountRow = (row: {
  productId: string;
  quantity: string;
  quantityUnit: string;
  entryCount: string | null;
  entryUnit: string | null;
}): AmountRow => ({
  productId: row.productId,
  quantity: Number(row.quantity),
  quantityUnit: row.quantityUnit,
  entryCount: row.entryCount === null ? null : Number(row.entryCount),
  entryUnit: row.entryUnit,
});

/** The recipe's items in their stored order, which is the order they are
 * appended to a meal in. */
export const fetchRecipeItems = async (recipeId: string): Promise<AmountRow[]> => {
  const rows = await db
    .select({
      productId: recipeItems.productId,
      quantity: recipeItems.quantity,
      quantityUnit: recipeItems.quantityUnit,
      entryCount: recipeItems.entryCount,
      entryUnit: recipeItems.entryUnit,
    })
    .from(recipeItems)
    .where(eq(recipeItems.recipeId, recipeId))
    .orderBy(asc(recipeItems.position));
  return rows.map(toAmountRow);
};

/** A meal's live rows, soft-deleted ones excluded, oldest first - the same
 * order the meal page lists them in. */
export const fetchMealItems = async (mealId: string): Promise<AmountRow[]> => {
  const rows = await db
    .select({
      productId: mealIngredients.productId,
      quantity: mealIngredients.quantity,
      quantityUnit: mealIngredients.quantityUnit,
      entryCount: mealIngredients.entryCount,
      entryUnit: mealIngredients.entryUnit,
    })
    .from(mealIngredients)
    .where(and(eq(mealIngredients.mealId, mealId), isNull(mealIngredients.deletedAt)))
    .orderBy(asc(mealIngredients.createdAt));
  return rows.map(toAmountRow);
};

export const fetchOwnedMeal = async (userId: string, mealId: string): Promise<OwnedMeal | null> => {
  const [meal] = await db
    .select({ id: meals.id, logDate: meals.logDate, recipeId: meals.recipeId })
    .from(meals)
    .where(and(eq(meals.id, mealId), eq(meals.userId, userId), isNull(meals.deletedAt)));
  return meal ?? null;
};

export const fetchOwnedRecipe = async (
  userId: string,
  recipeId: string,
): Promise<{ id: string; name: string } | null> => {
  const [recipe] = await db
    .select({ id: recipes.id, name: recipes.name })
    .from(recipes)
    .where(and(eq(recipes.id, recipeId), eq(recipes.userId, userId), isNull(recipes.deletedAt)));
  return recipe ?? null;
};

// One row per recipe item, grouped in JS rather than in SQL: a total has to be
// summed after each item is scaled, and a scaled item is not a column. The
// inner join drops a recipe with no items, which no write path can produce -
// a recipe is filed from a non-empty meal and its items are replaced, never
// emptied.
export const fetchRecipeSummaries = async (userId: string): Promise<RecipeSummary[]> => {
  const rows = await db
    .select({
      recipeId: recipes.id,
      name: recipes.name,
      quantity: recipeItems.quantity,
      basisQuantity: products.nutritionBasisQuantity,
      origin: products.nutritionOrigin,
      product: effectiveNutritionSelection(),
    })
    .from(recipes)
    .innerJoin(recipeItems, eq(recipeItems.recipeId, recipes.id))
    .innerJoin(products, eq(recipeItems.productId, products.id))
    .leftJoin(
      productOverrides,
      and(eq(productOverrides.productId, products.id), eq(productOverrides.userId, userId)),
    )
    .where(and(eq(recipes.userId, userId), isNull(recipes.deletedAt)))
    .orderBy(desc(recipes.lastUsedAt), asc(recipeItems.position));

  const byRecipe = new Map<string, RecipeSummary>();
  for (const row of rows) {
    const current = byRecipe.get(row.recipeId) ?? { id: row.recipeId, name: row.name, itemCount: 0, total: ZERO_NUTRITION, isAiEstimate: false };
    const contribution = scaleNutrition(
      productRowToNutritionValues(row.product),
      Number(row.quantity) / Number(row.basisQuantity),
    );
    byRecipe.set(row.recipeId, {
      ...current,
      itemCount: current.itemCount + 1,
      total: addNutrition(current.total, contribution),
      isAiEstimate: current.isAiEstimate || row.origin === AI_ESTIMATE_ORIGIN,
    });
  }
  return [...byRecipe.values()];
};

/** True while any of the recipe's items is still a lazy-track guess. */
export const recipeHasAiItems = async (recipeId: string): Promise<boolean> => {
  const [row] = await db
    .select({ id: recipeItems.id })
    .from(recipeItems)
    .innerJoin(products, eq(recipeItems.productId, products.id))
    .where(and(eq(recipeItems.recipeId, recipeId), eq(products.nutritionOrigin, AI_ESTIMATE_ORIGIN)))
    .limit(1);
  return row !== undefined;
};

export const insertRecipe = async (tx: DbTransaction, userId: string, name: string): Promise<string> => {
  const [row] = await tx
    .insert(recipes)
    .values({ userId, name: name.trim(), nameSearch: toSearchText(name.trim()) })
    .returning({ id: recipes.id });
  return row.id;
};

/** Replaces a recipe's items outright. `position` comes from the array, so the
 * caller's order is the stored order. */
export const replaceRecipeItems = async (
  tx: DbTransaction,
  recipeId: string,
  items: readonly AmountRow[],
): Promise<void> => {
  await tx.delete(recipeItems).where(eq(recipeItems.recipeId, recipeId));
  await tx.insert(recipeItems).values(
    items.map((item, position) => ({
      recipeId,
      productId: item.productId,
      quantity: String(item.quantity),
      quantityUnit: item.quantityUnit,
      entryCount: item.entryCount === null ? null : String(item.entryCount),
      entryUnit: item.entryUnit,
      position,
    })),
  );
};

/** Latest wins: a second recipe entered into one meal replaces the link, and
 * `null` is what deleteRecipe leaves behind. */
export const setMealRecipe = async (
  tx: DbTransaction,
  mealId: string,
  recipeId: string | null,
): Promise<void> => {
  await tx.update(meals).set({ recipeId }).where(eq(meals.id, mealId));
};

export const touchRecipe = async (tx: DbTransaction, recipeId: string): Promise<void> => {
  await tx.update(recipes).set({ lastUsedAt: sql`now()` }).where(eq(recipes.id, recipeId));
};

/**
 * Appends a recipe's items to a meal as ordinary ingredients.
 *
 * `quantity_unit` is re-read from the product rather than copied from the
 * recipe item: it must always equal the product's nutritionBasisUnit, and
 * that is enforced at the call site, exactly as saveMealIngredient does it.
 * A product whose basis unit changed since the recipe was filed would
 * otherwise scale against the wrong basis, silently.
 */
export const appendItemsToMeal = async (
  tx: DbTransaction,
  mealId: string,
  items: readonly AmountRow[],
): Promise<number> => {
  if (items.length === 0) {
    return 0;
  }
  const basisUnits = await tx
    .select({ id: products.id, unit: products.nutritionBasisUnit })
    .from(products)
    .where(inArray(products.id, items.map((item) => item.productId)));
  const unitByProduct = new Map(basisUnits.map((row) => [row.id, row.unit]));

  await tx.insert(mealIngredients).values(
    items.map((item) => ({
      mealId,
      productId: item.productId,
      quantity: String(item.quantity),
      quantityUnit: unitByProduct.get(item.productId) ?? item.quantityUnit,
      entryCount: item.entryCount === null ? null : String(item.entryCount),
      entryUnit: item.entryUnit,
      // "manual" for a recipe item (no source of its own) and for a freshly
      // typed row alike. An edit sheet's untouched row supplies its own
      // preserved source instead, so a fresh ai_estimated amount survives a
      // save the user made no changes to (CLAUDE.md, "Manual gram entry is
      // first-class").
      quantitySource: item.quantitySource ?? "manual",
    })),
  );
  return items.length;
};

export const renameRecipeRow = async (tx: DbTransaction, recipeId: string, name: string): Promise<void> => {
  const trimmed = name.trim();
  // Both columns in one statement: a name without its search text is a recipe
  // nobody can find, and two updates are two chances to write only one.
  await tx.update(recipes).set({ name: trimmed, nameSearch: toSearchText(trimmed) }).where(eq(recipes.id, recipeId));
};

/** Nulls the link on every meal that carries it, before the recipe row goes
 * away. Meals keep every ingredient and lose only their subtitle and their
 * `Edit this recipe` button - nutrition already logged never moves because a
 * recipe went away. Run before softDeleteRecipe, never after: a caller must
 * not be able to observe a deleted recipe still linked from a meal. */
export const unlinkMealsFromRecipe = async (tx: DbTransaction, recipeId: string): Promise<void> => {
  await tx.update(meals).set({ recipeId: null }).where(eq(meals.recipeId, recipeId));
};

/** Soft delete only. Call after unlinkMealsFromRecipe. */
export const softDeleteRecipe = async (tx: DbTransaction, recipeId: string): Promise<void> => {
  await tx.update(recipes).set({ deletedAt: sql`now()` }).where(eq(recipes.id, recipeId));
};

/**
 * Every meal in one local day, numbered by position.
 *
 * Same definition mealNumberInLocalDay uses in meals.ts - count of the user's
 * live meals on that day created at or before this one - expressed once for
 * the whole day, because the prompt names several meals at a time and one
 * round trip per meal is one too many.
 */
export const fetchMealNumbers = async (userId: string, logDate: string): Promise<Map<string, number>> => {
  const rows = await db
    .select({ id: meals.id, createdAt: meals.createdAt })
    .from(meals)
    .where(and(eq(meals.userId, userId), eq(meals.logDate, logDate), isNull(meals.deletedAt)))
    .orderBy(asc(meals.createdAt));
  return new Map(rows.map((row, index) => [row.id, index + 1]));
};

/** kcal for each of the given meals, read live through this user's own
 * corrections - the same figure the meal page prints. */
export const fetchMealKcals = async (userId: string, mealIds: readonly string[]): Promise<Map<string, number>> => {
  if (mealIds.length === 0) {
    return new Map();
  }
  const rows = await db
    .select({
      mealId: mealIngredients.mealId,
      quantity: mealIngredients.quantity,
      basisQuantity: products.nutritionBasisQuantity,
      energyKcal: sql<string>`coalesce(${productOverrides.energyKcal}, ${products.energyKcal})`,
    })
    .from(mealIngredients)
    .innerJoin(products, eq(mealIngredients.productId, products.id))
    .leftJoin(
      productOverrides,
      and(eq(productOverrides.productId, products.id), eq(productOverrides.userId, userId)),
    )
    .where(and(inArray(mealIngredients.mealId, [...mealIds]), isNull(mealIngredients.deletedAt)));

  return rows.reduce((totals, row) => {
    const kcal = (Number(row.energyKcal) * Number(row.quantity)) / Number(row.basisQuantity);
    return totals.set(row.mealId, (totals.get(row.mealId) ?? 0) + kcal);
  }, new Map<string, number>());
};

/** The user's other live meals on the same local day, from the same recipe.
 * The day filter is the rule, not a convenience: a closed day's total is a
 * figure the user already read. */
export const fetchSiblingMealIds = async (userId: string, meal: OwnedMeal): Promise<string[]> => {
  if (meal.recipeId === null) {
    return [];
  }
  const rows = await db
    .select({ id: meals.id })
    .from(meals)
    .where(
      and(
        eq(meals.userId, userId),
        eq(meals.logDate, meal.logDate),
        eq(meals.recipeId, meal.recipeId),
        isNull(meals.deletedAt),
        ne(meals.id, meal.id),
      ),
    )
    .orderBy(asc(meals.createdAt));
  return rows.map((row) => row.id);
};

/**
 * Replaces a meal's live rows with the given items.
 *
 * The old rows are soft-deleted rather than dropped, matching every other
 * removal in the app: purgeSoftDeleted collects them, and nothing else in the
 * schema hard-deletes an ingredient.
 */
export const replaceMealIngredients = async (
  tx: DbTransaction,
  mealId: string,
  items: readonly AmountRow[],
): Promise<void> => {
  await tx
    .update(mealIngredients)
    .set({ deletedAt: sql`now()` })
    .where(and(eq(mealIngredients.mealId, mealId), isNull(mealIngredients.deletedAt)));
  await appendItemsToMeal(tx, mealId, items);
};
