import { seededDensity } from "./densities";
import type { MeasureContext } from "./resolve-grams";

// Cup last: it is the largest and rarest of the four, and a label prints
// tbsp or ml far more often. Cup is in VOLUME_UNITS_TO_ML and has always
// been convertible - it was only ever missing from the picker.
const DENSITY_UNITS = ["tbsp", "tsp", "ml", "cup"] as const;

const hasKnownDensity = (context: MeasureContext): boolean =>
  context.densityGMl !== null || seededDensity(context.productName) !== null;

const gramsBasisUnits = (context: MeasureContext): string[] => {
  const candidates = [
    ...context.portions.map((portion) => portion.label),
    context.servingUnit,
    "g",
    ...(hasKnownDensity(context) ? DENSITY_UNITS : []),
  ];
  return [...new Set(candidates.filter((unit): unit is string => unit !== null))];
};

/**
 * Units to offer for a product's amount entry, in display order. A
 * non-grams basis (e.g. "tbsp" for a Nutella-style product) offers only
 * that one unit - there is no density to convert it to grams, and no other
 * unit is convertible to whatever it's actually stored per (spec §6).
 */
export const availableUnits = (context: MeasureContext): string[] =>
  context.nutritionBasisUnit === "g" ? gramsBasisUnits(context) : [context.nutritionBasisUnit];

/**
 * Which unit the amount field should start on. A portion, when the product
 * has one - that is the tap this whole feature exists to make cheap. Then
 * the product's own serving unit, which for a per-unit product is always its
 * basis (spec §5), so this still lands on the right unit there.
 */
export const defaultUnit = (context: MeasureContext): string => availableUnits(context)[0] ?? "g";
