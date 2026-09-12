"use server";

import type { NutritionValues } from "@/actions/products";
import { findStoredMeasures } from "@/actions/products";
import { requireUserId } from "@/lib/auth/require-user";
import {
  hasLearned,
  learnFromServing,
  NOTHING_LEARNED,
  type LearnedMeasures,
} from "@/lib/measures/learn";
import { resolveNetWeightGrams } from "@/lib/measures/net-weight";
import { resolveGrams, type MeasureContext, type Resolution } from "@/lib/measures/resolve-grams";
import { scaleNutrition, scalePerServingToPer100g } from "@/lib/nutrition/scale-per-serving";
import { HttpOcrProvider } from "@/lib/ocr/http-provider";
import { MockOcrProvider } from "@/lib/ocr/mock-provider";
import type { NullableNutritionValues, NutritionTableRead, OcrProvider } from "@/lib/ocr/provider";

/**
 * A nutrition read the confirm step can use, or the one question that stands
 * between us and it. `needs-serving-size` is reached only when the serving
 * text doesn't parse as a measurement at all, or parses to a non-positive
 * quantity - a recognized-but-unconvertible unit (e.g. "tbsp" with no known
 * density) fast-paths to a per-unit product instead of asking.
 */
export type NutritionRead =
  | {
      kind: "per100g";
      values: NullableNutritionValues;
      flags: string[];
      learned: LearnedMeasures;
      /** The product row's own nutrition_basis_unit/nutrition_basis_quantity -
       * "g"/100 for a gram-resolved read, or the recognized household unit
       * with quantity 1 when the per-unit fallback built this read instead. */
      nutritionBasisUnit: string;
      nutritionBasisQuantity: number;
    }
  | {
      kind: "needs-serving-size";
      servingSizeText: string;
      perServing: NutritionValues;
      /** A guess from the front panel's net weight divided by the label's
       * own servings-per-container count - null whenever either figure is
       * missing or unreadable. Always a prefill the user can edit or
       * override, never a value that skips asking. */
      prefillGrams: number | null;
      /** The household unit `resolveGrams` recognised but could not convert
       * (e.g. "tbsp" with no known density) - null when the text itself
       * didn't parse at all. Lets the ask distinguish "we don't know this
       * unit's weight yet" from "that wasn't a measurement", instead of one
       * generic message for both. */
      unitName: string | null;
    };

const getProvider = (): OcrProvider =>
  process.env.OCR_PROVIDER === "mock" ? new MockOcrProvider() : new HttpOcrProvider();

export const ocrProductName = async (
  photo: Blob,
): Promise<{ text: string; netWeightText: string | null }> => {
  await requireUserId();
  return getProvider().extractProductName(photo);
};

const GRAM_BASIS_UNIT = "g";
const GRAM_BASIS_QUANTITY = 100;
const PER_UNIT_BASIS_QUANTITY = 1;

const scaledRead = async (
  perServing: NutritionValues,
  grams: number,
  learned: LearnedMeasures,
): Promise<NutritionRead> => {
  const values = scalePerServingToPer100g(perServing, grams);
  const { flags } = await getProvider().validate(values);
  return {
    kind: "per100g",
    values,
    flags,
    learned,
    nutritionBasisUnit: GRAM_BASIS_UNIT,
    nutritionBasisQuantity: GRAM_BASIS_QUANTITY,
  };
};

// Spec §5's fix: a unit resolveGrams recognized but couldn't convert to
// grams (no density, no learned weight) becomes the product's own basis
// instead of a dead-end question - "how many grams is 2 tbsp" has no
// answer the user can give either.
const perUnitRead = async (
  perServing: NutritionValues,
  unitName: string,
  parsedQuantity: number,
): Promise<NutritionRead> => {
  const values = scaleNutrition(perServing, PER_UNIT_BASIS_QUANTITY / parsedQuantity);
  const { flags } = await getProvider().validate(values);
  return {
    kind: "per100g",
    values,
    flags,
    learned: { densityGMl: null, servingUnit: unitName, servingGrams: null },
    nutritionBasisUnit: unitName,
    nutritionBasisQuantity: PER_UNIT_BASIS_QUANTITY,
  };
};

// A zero (or negative) quantity is "recognized unit, unusable amount" - e.g.
// resolveGrams("0g", ...) reports unitName "g" with quantity 0, non-null on
// both fields. Fast-pathing that into perUnitRead would divide by zero and
// write Infinity into the shared products table, so the fallback requires a
// genuinely positive quantity, not just a non-null one.
const isPerUnitFallback = (
  resolution: Extract<Resolution, { kind: "unresolved" }>,
): resolution is Extract<Resolution, { kind: "unresolved" }> & { unitName: string; quantity: number } =>
  resolution.unitName !== null && resolution.quantity !== null && resolution.quantity > 0;

const contextFor = async (productName: string): Promise<MeasureContext> => ({
  productName,
  ...(await findStoredMeasures(productName)),
});

// A guess, not a substitute for asking: only reached once every other
// resolution failed, and lands as an editable prefill, never auto-submitted.
const netWeightPrefill = (
  netWeightText: string | null,
  servingsPerContainer: number | null,
  context: MeasureContext,
): number | null => {
  if (netWeightText === null || servingsPerContainer === null || servingsPerContainer <= 0) {
    return null;
  }
  const netWeightGrams = resolveNetWeightGrams(netWeightText, context);
  return netWeightGrams === null ? null : netWeightGrams / servingsPerContainer;
};

// Exported so a unit test can exercise the resolved-serving branch directly.
// Every export from a "use server" file is independently reachable as its
// own Server Action, so it checks auth itself.
export const fromResolvedServing = async (
  perServing: NutritionValues,
  servingSizeText: string,
  grams: number,
): Promise<NutritionRead> => {
  await requireUserId();
  const learned = learnFromServing(servingSizeText, grams);
  return scaledRead(perServing, grams, learned);
};

// Split from fromUsLabel for the line budget; exported and auth-checked for
// the same reason as fromResolvedServing.
export const needsServingSizeRead = async (
  read: Extract<NutritionTableRead, { format: "us" }>,
  netWeightText: string | null,
  context: MeasureContext,
  unitName: string | null,
): Promise<NutritionRead> => {
  await requireUserId();
  return {
    kind: "needs-serving-size",
    servingSizeText: read.servingSizeText,
    perServing: read.perServing,
    prefillGrams: netWeightPrefill(netWeightText, read.servingsPerContainer, context),
    unitName,
  };
};

const fromUsLabel = async (
  read: Extract<NutritionTableRead, { format: "us" }>,
  productNameGuess: string,
  netWeightText: string | null,
): Promise<NutritionRead> => {
  // A printed weight is the most certain figure on the label, and it also
  // states the product's density for free when the measure beside it is a
  // volume - no user input and no AI, derived from data already being read.
  if (read.servingGrams !== null) {
    return fromResolvedServing(read.perServing, read.servingSizeText, read.servingGrams);
  }

  const context = await contextFor(productNameGuess);
  const resolution = resolveGrams(read.servingSizeText, context);
  if (resolution.kind === "unresolved") {
    if (isPerUnitFallback(resolution)) {
      return perUnitRead(read.perServing, resolution.unitName, resolution.quantity);
    }
    return await needsServingSizeRead(read, netWeightText, context, resolution.unitName);
  }
  // This is a brand-new product row, so all three learned columns start
  // NULL - whatever the lookup or seeded density just resolved is this row's
  // first-ever learned data, not a duplicate of anything already on it.
  // Persisting it now means the next scan of this exact product resolves
  // straight from its own row instead of re-deriving via density or a lookup.
  const fromLabel = learnFromServing(read.servingSizeText, resolution.grams);
  const learned = hasLearned(fromLabel) ? fromLabel : NOTHING_LEARNED;
  return scaledRead(read.perServing, resolution.grams, learned);
};

export const ocrNutritionTable = async (
  photo: Blob,
  productNameGuess: string,
  netWeightText: string | null = null,
): Promise<NutritionRead> => {
  await requireUserId();
  const read = await getProvider().extractNutritionTable(photo);
  if (read.format === "eu") {
    return {
      kind: "per100g",
      values: read.per100g,
      flags: read.flags,
      learned: NOTHING_LEARNED,
      nutritionBasisUnit: GRAM_BASIS_UNIT,
      nutritionBasisQuantity: GRAM_BASIS_QUANTITY,
    };
  }
  return fromUsLabel(read, productNameGuess, netWeightText);
};

/**
 * Resolve the user's own answer to the serving-size question.
 *
 * The answer is fed back through the same resolver, so "1.8 oz" works as well
 * as "52g" - useful because US packages frequently print net weight in
 * ounces. A recognized-but-unconvertible unit (e.g. "2 tbsp") fast-paths to a
 * per-unit product instead of asking again; only an answer that doesn't parse
 * at all, or parses to a non-positive quantity, re-asks rather than inventing
 * a number.
 */
export const resolveServingSize = async (
  answerText: string,
  servingSizeText: string,
  perServing: NutritionValues,
  productNameGuess: string,
): Promise<NutritionRead> => {
  await requireUserId();
  const resolution = resolveGrams(answerText, await contextFor(productNameGuess));
  if (resolution.kind === "unresolved") {
    if (isPerUnitFallback(resolution)) {
      return perUnitRead(perServing, resolution.unitName, resolution.quantity);
    }
    // prefillGrams is unused here: ServingSizeStep only checks read.kind on
    // this branch and re-shows its own local error, never re-reading these
    // fields (same as servingSizeText/perServing above).
    return { kind: "needs-serving-size", servingSizeText, perServing, prefillGrams: null, unitName: resolution.unitName };
  }

  // What the answer teaches is attached to the label's own serving line, not
  // to the answer: "1 bas" is the unit the next scan of this product prints.
  const fromLabel = learnFromServing(servingSizeText, resolution.grams);
  const learned = hasLearned(fromLabel) ? fromLabel : NOTHING_LEARNED;
  return scaledRead(perServing, resolution.grams, learned);
};

export const validateNutrition = async (
  values: NutritionValues,
  energyKj?: number,
): Promise<{ flags: string[] }> => {
  await requireUserId();
  return getProvider().validate(values, energyKj);
};
