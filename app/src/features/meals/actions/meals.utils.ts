import type { MeasureContext } from "@/lib/measures/resolve-grams";
import { resolveQuantity } from "@/lib/measures/resolve-quantity";
import { scaleNutrition } from "@/lib/nutrition/scale-per-serving";

import type { NutritionValues } from "@/types/nutrition";

// Lives here, not in meals.ts: meals.ts is "use server", which may only
// export async functions.
export const HISTORY_PAGE_SIZE = 20;

// A hand-edited ?pages= must not read the whole log in one request.
export const MAX_HISTORY_PAGES = 10;

/** One copied row as pasteIngredients receives it: amounts only. Name and
 * nutrition stay behind; the pasted row reads the product's own. */
export interface PasteItem {
  productId: string;
  quantity: number;
  quantityUnit: string;
  entryCount: number | null;
  entryUnit: string | null;
  quantitySource: "ai_estimated" | "manual";
}

// Judgment, not measurement: comfortably above the ~15 rows a real meal
// reaches, low enough that a forged list can't make one paste a bulk insert.
export const MAX_PASTE_ITEMS = 50;

// Largest value numeric(10,2) holds (NUTRITION_COLUMN_PRECISION/SCALE in
// lib/db/schema/nutrition.ts). Anything above it fails the insert instead.
const MAX_STORED_AMOUNT = 99_999_999.99;

const QUANTITY_SOURCES: readonly unknown[] = ["ai_estimated", "manual"];

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// A malformed id reaching Postgres throws "invalid input syntax for type
// uuid" rather than matching nothing.
export const isUuid = (value: unknown): value is string => typeof value === "string" && UUID_PATTERN.test(value);

const isStorableAmount = (value: unknown): boolean =>
  typeof value === "number" && Number.isFinite(value) && value > 0 && value <= MAX_STORED_AMOUNT;

const isPasteItem = (value: unknown): value is PasteItem => {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const item = value as Record<string, unknown>;
  return (
    isUuid(item.productId) &&
    isStorableAmount(item.quantity) &&
    typeof item.quantityUnit === "string" &&
    (item.entryCount === null || isStorableAmount(item.entryCount)) &&
    (item.entryUnit === null || typeof item.entryUnit === "string") &&
    QUANTITY_SOURCES.includes(item.quantitySource)
  );
};

// The list arrives from the browser, so its type is a claim: check every
// field pasteIngredients writes before any of it reaches the database.
export const isValidPasteItems = (items: unknown): items is readonly PasteItem[] =>
  Array.isArray(items) && items.length > 0 && items.length <= MAX_PASTE_ITEMS && items.every(isPasteItem);

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
