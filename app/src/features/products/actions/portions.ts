"use server";

import { and, eq } from "drizzle-orm";

import { requireUserId } from "@/lib/auth/require-user";
import { db } from "@/lib/db";
import { portionOverrides, products } from "@/lib/db/schema";
import type { Portion } from "@/lib/measures/portions";
import { resolvePortions } from "@/lib/measures/resolve-portions";

/**
 * This user's own weight for one named portion of one product.
 *
 * Never writes `products`: that row is a cross-user cache, and one user's
 * kitchen scale is not everyone's bread. A second edit of the same label
 * replaces the first (composite PK), and `clearPortionGrams` is the exact
 * revert - the standard figure was never touched.
 */
export const setPortionGrams = async (
  productId: string,
  portionLabel: string,
  grams: number,
): Promise<void> => {
  const userId = await requireUserId();
  if (!(grams > 0)) {
    throw new Error(`A portion weight must be a positive number of grams, got ${grams}`);
  }
  await db
    .insert(portionOverrides)
    .values({ userId, productId, portionLabel, grams: String(grams) })
    .onConflictDoUpdate({
      target: [portionOverrides.userId, portionOverrides.productId, portionOverrides.portionLabel],
      set: { grams: String(grams), updatedAt: new Date() },
    });
};

/** Drops this user's figure, so the standard one applies again. */
export const clearPortionGrams = async (productId: string, portionLabel: string): Promise<void> => {
  const userId = await requireUserId();
  await db
    .delete(portionOverrides)
    .where(
      and(
        eq(portionOverrides.userId, userId),
        eq(portionOverrides.productId, productId),
        eq(portionOverrides.portionLabel, portionLabel),
      ),
    );
};

/**
 * This user's portions for one product, re-read after an edit.
 *
 * The capture wizard holds the chosen product in reducer state, which no
 * server re-render reaches, so the client asks for the merged figures back
 * rather than guessing them - a revert restores weights only the server knows.
 */
export const getPortions = async (productId: string): Promise<readonly Portion[]> => {
  const userId = await requireUserId();
  const [row] = await db
    .select({
      nameSearch: products.nameSearch,
      standardSlug: products.standardSlug,
      servingUnit: products.servingUnit,
      servingGrams: products.servingGrams,
      nutritionBasisUnit: products.nutritionBasisUnit,
    })
    .from(products)
    .where(eq(products.id, productId));
  if (!row) {
    throw new Error(`No product with id ${productId}`);
  }
  const overrideRows = await db
    .select({ label: portionOverrides.portionLabel, grams: portionOverrides.grams })
    .from(portionOverrides)
    .where(and(eq(portionOverrides.userId, userId), eq(portionOverrides.productId, productId)));

  return resolvePortions({
    standardSlug: row.standardSlug,
    nameSearch: row.nameSearch,
    servingUnit: row.servingUnit,
    servingGrams: row.servingGrams === null ? null : Number(row.servingGrams),
    nutritionBasisUnit: row.nutritionBasisUnit,
    overrides: Object.fromEntries(overrideRows.map((override) => [override.label, Number(override.grams)])),
  });
};
