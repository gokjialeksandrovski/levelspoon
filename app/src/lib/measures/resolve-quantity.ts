import { resolveGrams, type MeasureContext } from "./resolve-grams";

export type QuantityResolution =
  | { kind: "resolved"; quantity: number; quantityUnit: string }
  | { kind: "unresolved" };

// A per-unit-basis product (e.g. Nutella, "1 tbsp") has no density to
// convert its own basis unit to grams - resolveGrams would only report it
// unresolved. Recognizing the selected unit already IS that basis unit and
// saving the typed count as-is is the only conversion these products get
// (spec §6).
const isDirectBasisUnit = (unit: string, context: MeasureContext): boolean =>
  unit !== "g" && unit === context.nutritionBasisUnit;

// parseMeasure's regex carries no sign, so "-50 g" would reach resolveGrams as
// 50 g. Caught here rather than there: a leading minus in OCR'd label text is
// noise to skip, but in a typed count it is an amount the user did not mean.
const isNegativeCount = (count: string): boolean => count.trimStart().startsWith("-");

/**
 * Turns a typed count + selected unit into what saveMealIngredient stores:
 * either the count itself (a per-unit product's own basis unit) or grams
 * resolved through resolveGrams (every other unit, including "g").
 */
export const resolveQuantity = (count: string, unit: string, context: MeasureContext): QuantityResolution => {
  if (isNegativeCount(count)) {
    return { kind: "unresolved" };
  }
  if (isDirectBasisUnit(unit, context)) {
    const quantity = Number(count);
    return quantity > 0 ? { kind: "resolved", quantity, quantityUnit: unit } : { kind: "unresolved" };
  }

  const resolution = resolveGrams(`${count} ${unit}`, context);
  return resolution.kind === "grams"
    ? { kind: "resolved", quantity: resolution.grams, quantityUnit: "g" }
    : { kind: "unresolved" };
};
