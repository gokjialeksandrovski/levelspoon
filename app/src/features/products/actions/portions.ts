"use server";

import { and, eq } from "drizzle-orm";

import { requireUserId } from "@/lib/auth/require-user";
import { db } from "@/lib/db";
import { portionOverrides } from "@/lib/db/schema";

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
