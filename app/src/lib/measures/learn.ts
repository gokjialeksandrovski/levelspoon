import { parseMeasure } from "./parse-measure";
import { MASS_UNITS_TO_GRAMS, VOLUME_UNITS_TO_ML } from "./units";

/** What one serving line taught about a product. All-null means it taught nothing. */
export interface LearnedMeasures {
  densityGMl: number | null;
  servingUnit: string | null;
  servingGrams: number | null;
}

export const NOTHING_LEARNED: LearnedMeasures = {
  densityGMl: null,
  servingUnit: null,
  servingGrams: null,
};

export const hasLearned = (learned: LearnedMeasures): boolean =>
  learned.densityGMl !== null || learned.servingGrams !== null;

/**
 * What a serving line plus its gram weight states about the product.
 *
 * A line printing both a volume and a weight ("2 Tbsp (37g)") states the
 * product's density outright - free, with no user input and no AI. A line
 * printing a count ("1 bar") states what one of that count weighs. A line that
 * already states a mass teaches nothing new.
 */
export const learnFromServing = (servingSizeText: string, servingGrams: number): LearnedMeasures => {
  const measure = parseMeasure(servingSizeText);
  if (measure === null || servingGrams <= 0 || measure.quantity <= 0) {
    return NOTHING_LEARNED;
  }
  if (measure.unit in MASS_UNITS_TO_GRAMS) {
    return NOTHING_LEARNED;
  }

  const millilitresPerUnit = VOLUME_UNITS_TO_ML[measure.unit];
  if (millilitresPerUnit !== undefined) {
    return {
      densityGMl: servingGrams / (measure.quantity * millilitresPerUnit),
      servingUnit: null,
      servingGrams: null,
    };
  }

  return {
    densityGMl: null,
    servingUnit: measure.unit,
    servingGrams: servingGrams / measure.quantity,
  };
};
