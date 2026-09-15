import { scaleNutrition } from "@/lib/nutrition/scale-per-serving";

import type { NutritionValues } from "@/types/nutrition";

// Lives here, not in meals.ts: meals.ts is "use server", which may only
// export async functions.
export const HISTORY_PAGE_SIZE = 20;

// Ingredient's share of a meal: product's per-basis-unit figures scaled to
// the amount logged. basisQuantity is 100 for per-100g, 1 for per-unit.
export const computeContribution = (
  product: NutritionValues,
  quantity: number,
  basisQuantity: number,
): NutritionValues => scaleNutrition(product, quantity / basisQuantity);
