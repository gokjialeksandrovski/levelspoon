import type { NutritionValues } from "./products";

export const GRAMS_PER_HUNDRED = 100;

// Lives here (not in meals.ts) because meals.ts has "use server" at the top,
// and a "use server" file may only export async functions - see commit
// 09270a4, which moved computeContribution out for the same reason.
export const HISTORY_PAGE_SIZE = 20;

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
