import type { NutritionValues } from "./products";

export const GRAMS_PER_HUNDRED = 100;

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
