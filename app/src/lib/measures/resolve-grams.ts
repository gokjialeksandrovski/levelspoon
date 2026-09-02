import { seededDensity } from "./densities";
import { parseMeasure, type Measure } from "./parse-measure";
import { MASS_UNITS_TO_GRAMS, VOLUME_UNITS_TO_ML } from "./units";

/** What the caller knows about this product. All fields are null for a product with nothing learned yet. */
export interface MeasureContext {
  productName: string;
  densityGMl: number | null;
  servingUnit: string | null;
  servingGrams: number | null;
}

export type Resolution =
  | { kind: "grams"; grams: number; via: "mass" | "volume" | "learned" }
  | { kind: "unresolved"; measureText: string; unitName: string | null };

const unresolved = (measureText: string, measure: Measure | null): Resolution => ({
  kind: "unresolved",
  measureText,
  unitName: measure?.unit ?? null,
});

const massGrams = (measure: Measure): number | null => {
  const gramsPerUnit = MASS_UNITS_TO_GRAMS[measure.unit];
  return gramsPerUnit === undefined ? null : measure.quantity * gramsPerUnit;
};

const density = (context: MeasureContext): number | null =>
  context.densityGMl ?? seededDensity(context.productName);

const volumeGrams = (measure: Measure, context: MeasureContext): number | null => {
  const millilitresPerUnit = VOLUME_UNITS_TO_ML[measure.unit];
  const densityGMl = density(context);
  if (millilitresPerUnit === undefined || densityGMl === null) {
    return null;
  }
  return measure.quantity * millilitresPerUnit * densityGMl;
};

// A label prints "1 bar" and a user logs "2 bars", so the stored unit is
// compared without its plural s. Stripping it here, rather than storing a
// singular form, keeps whatever the label actually printed (OCR noise
// included) intact on the product row.
const singular = (unit: string): string => unit.toLowerCase().replace(/s$/, "");

const learnedGrams = (measure: Measure, context: MeasureContext): number | null => {
  if (context.servingUnit === null || context.servingGrams === null) {
    return null;
  }
  if (singular(context.servingUnit) !== singular(measure.unit)) {
    return null;
  }
  return measure.quantity * context.servingGrams;
};

/**
 * Grams for one printed or typed measure, most-certain strategy first: an
 * explicit mass, then a volume times a known density, then a serving weight
 * learned for this product. An unknown density is never assumed to be water -
 * a wrong number the user cannot see is worse than a question they can answer.
 */
export const resolveGrams = (measureText: string, context: MeasureContext): Resolution => {
  const measure = parseMeasure(measureText);
  if (measure === null) {
    return unresolved(measureText, null);
  }

  const mass = massGrams(measure);
  if (mass !== null) {
    return mass > 0 ? { kind: "grams", grams: mass, via: "mass" } : unresolved(measureText, measure);
  }

  const volume = volumeGrams(measure, context);
  if (volume !== null && volume > 0) {
    return { kind: "grams", grams: volume, via: "volume" };
  }

  const learned = learnedGrams(measure, context);
  if (learned !== null && learned > 0) {
    return { kind: "grams", grams: learned, via: "learned" };
  }

  return unresolved(measureText, measure);
};
