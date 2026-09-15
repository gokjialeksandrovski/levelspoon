import { scaleNutrition } from "@/lib/nutrition/scale-per-serving";

import type { NutritionValues } from "@/types/nutrition";

// Lives here (not in meals.ts) because meals.ts has "use server" at the top,
// and a "use server" file may only export async functions - see commit
// 09270a4, which moved computeContribution out for the same reason.
export const HISTORY_PAGE_SIZE = 20;

// One ingredient's share of a meal: its product's per-basis-unit figures
// scaled to the amount actually logged. basisQuantity is the product's
// nutritionBasisQuantity (100 for a per-100g product, 1 for a per-unit one).
export const computeContribution = (
  product: NutritionValues,
  quantity: number,
  basisQuantity: number,
): NutritionValues => scaleNutrition(product, quantity / basisQuantity);
