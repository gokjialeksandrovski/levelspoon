import { seededDensity } from "./densities";
import type { MeasureContext } from "./resolve-grams";

const DENSITY_UNITS = ["tbsp", "tsp", "ml"] as const;

const hasKnownDensity = (context: MeasureContext): boolean =>
  context.densityGMl !== null || seededDensity(context.productName) !== null;

const gramsBasisUnits = (context: MeasureContext): string[] => {
  const candidates = [context.servingUnit, "g", ...(hasKnownDensity(context) ? DENSITY_UNITS : [])];
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
 * Which unit the amount field should start on. No basis-aware branch needed
 * here: a per-unit product's servingUnit is always set to the same value as
 * its basis (spec §5), so this already lands on the right unit.
 */
export const defaultUnit = (context: MeasureContext): string => context.servingUnit ?? "g";
