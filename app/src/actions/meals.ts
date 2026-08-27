"use server";

import { db } from "@/lib/db";
import { mealIngredients } from "@/lib/db/schema";

export interface SaveMealIngredientInput {
  mealId: string;
  productId: string;
  quantityG: number;
  quantitySource: "ai_estimated" | "manual";
}

export const saveMealIngredient = async (
  input: SaveMealIngredientInput,
): Promise<{ mealIngredientId: string }> => {
  const [row] = await db
    .insert(mealIngredients)
    .values({
      mealId: input.mealId,
      productId: input.productId,
      quantityG: String(input.quantityG),
      quantitySource: input.quantitySource,
    })
    .returning({ id: mealIngredients.id });

  return { mealIngredientId: row.id };
};
