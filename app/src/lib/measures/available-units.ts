import { seededDensity } from "./densities";
import type { MeasureContext } from "./resolve-grams";

const DENSITY_UNITS = ["tbsp", "tsp", "ml"] as const;

const hasKnownDensity = (context: MeasureContext): boolean =>
  context.densityGMl !== null || seededDensity(context.productName) !== null;

/**
 * Units to offer for a product's amount entry, in display order. Always
 * includes "g" - a product with nothing learned degrades to grams-only,
 * identical to the pre-unit-aware field (spec §7).
 */
export const availableUnits = (context: MeasureContext): string[] => {
  const candidates = [
    context.servingUnit,
    "g",
    ...(hasKnownDensity(context) ? DENSITY_UNITS : []),
  ];
  return [...new Set(candidates.filter((unit): unit is string => unit !== null))];
};

/** Which unit the amount field should start on. */
export const defaultUnit = (context: MeasureContext): string => context.servingUnit ?? "g";
