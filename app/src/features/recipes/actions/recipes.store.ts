// No "use server": every export takes a userId, and as a Server Action that
// would let a browser read or write any user's recipes. Only "use server"
// modules import this file (CLAUDE.md, "Server/client boundary"); they resolve
// the user themselves and hand it in. Same rule as weight.store.ts.
import { and, asc, desc, eq, isNull, sql } from "drizzle-orm";

import { db, type DbTransaction } from "@/lib/db";
import { effectiveNutritionSelection } from "@/lib/db/effective-nutrition";
import { mealIngredients, meals, productOverrides, products, recipeItems, recipes } from "@/lib/db/schema";
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
}

export interface RecipeSummary {
  id: string;
  name: string;
  itemCount: number;
  total: NutritionValues;
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
    const current = byRecipe.get(row.recipeId) ?? { id: row.recipeId, name: row.name, itemCount: 0, total: ZERO_NUTRITION };
    const contribution = scaleNutrition(
      productRowToNutritionValues(row.product),
      Number(row.quantity) / Number(row.basisQuantity),
    );
    byRecipe.set(row.recipeId, {
      ...current,
      itemCount: current.itemCount + 1,
      total: addNutrition(current.total, contribution),
    });
  }
  return [...byRecipe.values()];
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
