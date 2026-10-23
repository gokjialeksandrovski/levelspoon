import type { MeasureContext } from "@/lib/measures/resolve-grams";
import { resolveQuantity } from "@/lib/measures/resolve-quantity";
import { scaleNutrition } from "@/lib/nutrition/scale-per-serving";

import type { NutritionValues } from "@/types/nutrition";

// Lives here, not in meals.ts: meals.ts is "use server", which may only
// export async functions.
export const HISTORY_PAGE_SIZE = 20;

// A hand-edited ?pages= must not read the whole log in one request.
export const MAX_HISTORY_PAGES = 10;

// Ingredient's share of a meal: product's per-basis-unit figures scaled to
// the amount logged. basisQuantity is 100 for per-100g, 1 for per-unit.
export const computeContribution = (
  product: NutritionValues,
  quantity: number,
  basisQuantity: number,
): NutritionValues => scaleNutrition(product, quantity / basisQuantity);

export type ContributionPreview =
  | { kind: "ready"; contribution: NutritionValues }
  | { kind: "unavailable" };

export interface ContributionPreviewInput {
  count: string;
  unit: string;
  context: MeasureContext;
  nutritionPerBasis: NutritionValues;
  basisQuantity: number;
}

// What a half-typed amount would add, for the live readout under the amount
// field. Same resolve-then-scale path saveMealIngredient persists through, so
// the preview and the saved row can never disagree.
//
// "unavailable" is a real state, not a failure: an empty field, a unit with no
// conversion for this product, or a count that isn't a positive number all
// render nothing. A wrong figure here is worse than none - the user trusts it.
export const previewContribution = (input: ContributionPreviewInput): ContributionPreview => {
  if (input.basisQuantity <= 0) {
    return { kind: "unavailable" };
  }
  const resolution = resolveQuantity(input.count.trim(), input.unit, input.context);
  if (resolution.kind === "unresolved" || !(resolution.quantity > 0)) {
    return { kind: "unavailable" };
  }
  return {
    kind: "ready",
    contribution: computeContribution(input.nutritionPerBasis, resolution.quantity, input.basisQuantity),
  };
};
