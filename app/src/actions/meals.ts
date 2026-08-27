"use server";

import { db } from "@/lib/db";
import { mealIngredients } from "@/lib/db/schema";

import type { NutritionValues } from "./products";

const GRAMS_PER_HUNDRED = 100;

export const computeContribution = (
  product: NutritionValues,
  quantityG: number,
): NutritionValues => {
  const factor = quantityG / GRAMS_PER_HUNDRED;
  return {
    energyKcal: product.energyKcal * factor,
    fatG: product.fatG * factor,
    saturatesG: product.saturatesG * factor,
    carbohydrateG: product.carbohydrateG * factor,
    sugarsG: product.sugarsG * factor,
    proteinG: product.proteinG * factor,
    saltG: product.saltG * factor,
  };
};

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
