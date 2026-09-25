// No "use server": takes a userId, so as a Server Action it would let a
// browser file products under any user. Same rule as recipes.store.ts.
import { and, eq, inArray, isNull, sql } from "drizzle-orm";

import type { DbTransaction } from "@/lib/db";
import { AI_ESTIMATE_ORIGIN, mealIngredients, products } from "@/lib/db/schema";
import { toSearchText } from "@/lib/db/search-text";

import type { EstimatedItem } from "./lazy-track.utils";

/** One private row per guessed item, ids in input order. No photo, no barcode,
 * source 'user': the products_ai_estimate_private CHECK holds all three. */
export const insertAiProducts = async (tx: DbTransaction, userId: string, items: readonly EstimatedItem[]): Promise<string[]> => {
  const rows = await tx
    .insert(products)
    .values(
      items.map((item) => ({
        name: item.name,
        nameSearch: toSearchText(item.name),
        energyKcal: String(item.per100g.energyKcal),
        fatG: String(item.per100g.fatG),
        saturatesG: String(item.per100g.saturatesG),
        carbohydrateG: String(item.per100g.carbohydrateG),
        sugarsG: String(item.per100g.sugarsG),
        proteinG: String(item.per100g.proteinG),
        saltG: String(item.per100g.saltG),
        fibreG: item.per100g.fibreG === null ? null : String(item.per100g.fibreG),
        nutritionOrigin: AI_ESTIMATE_ORIGIN,
        createdByUserId: userId,
      })),
    )
    .returning({ id: products.id });
  return rows.map((row) => row.id);
};

/** Soft-deletes the meal's guesses whose grams nobody edited - the rows a
 * re-estimate replaces and Undo takes back. Soft, like removeMealIngredient,
 * so purgeSoftDeleted collects them later. */
export const removeUntouchedEstimate = async (tx: DbTransaction, mealId: string): Promise<void> => {
  const guesses = tx.select({ id: products.id }).from(products).where(eq(products.nutritionOrigin, AI_ESTIMATE_ORIGIN));
  await tx
    .update(mealIngredients)
    .set({ deletedAt: sql`now()` })
    .where(
      and(
        eq(mealIngredients.mealId, mealId),
        isNull(mealIngredients.deletedAt),
        eq(mealIngredients.quantitySource, "ai_estimated"),
        inArray(mealIngredients.productId, guesses),
      ),
    );
};
