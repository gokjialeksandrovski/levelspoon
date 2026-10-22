import { isLooseSolid, seededDensity } from "./densities";
import type { MeasureContext } from "./resolve-grams";

const SPOON_UNITS = ["tbsp", "tsp", "ml"] as const;

const hasKnownDensity = (context: MeasureContext): boolean =>
  context.densityGMl !== null || seededDensity(context.productName) !== null;

// Cup last: it is the largest and rarest of the four, and a label prints tbsp
// or ml far more often.
//
// Withheld from a dry good whose only density is the seeded cooking-table
// figure, because that figure cannot say how hard the cup was packed. A
// density the product's own label taught is a measured one, so it keeps cup.
const densityUnits = (context: MeasureContext): string[] =>
  context.densityGMl === null && isLooseSolid(context.productName)
    ? [...SPOON_UNITS]
    : [...SPOON_UNITS, "cup"];

const gramsBasisUnits = (context: MeasureContext): string[] => {
  const candidates = [
    ...context.portions.map((portion) => portion.label),
    context.servingUnit,
    "g",
    ...(hasKnownDensity(context) ? densityUnits(context) : []),
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
