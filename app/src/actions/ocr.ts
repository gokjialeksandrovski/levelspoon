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
import { resolveGrams, type MeasureContext } from "@/lib/measures/resolve-grams";
import { scalePerServingToPer100g } from "@/lib/nutrition/scale-per-serving";
import { HttpOcrProvider } from "@/lib/ocr/http-provider";
import { MockOcrProvider } from "@/lib/ocr/mock-provider";
import type { NullableNutritionValues, NutritionTableRead, OcrProvider } from "@/lib/ocr/provider";

/**
 * A nutrition read the confirm step can use, or the one question that stands
 * between us and it. `needs-serving-size` is reached only when no bracketed
 * gram weight is printed, no density resolves the measure, and nothing was
 * learned for this product before.
 */
export type NutritionRead =
  | {
      kind: "per100g";
      values: NullableNutritionValues;
      flags: string[];
      learned: LearnedMeasures;
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
    };

const getProvider = (): OcrProvider =>
  process.env.OCR_PROVIDER === "mock" ? new MockOcrProvider() : new HttpOcrProvider();

export const ocrProductName = async (
  photo: Blob,
): Promise<{ text: string; netWeightText: string | null }> => {
  await requireUserId();
  return getProvider().extractProductName(photo);
};

const scaledRead = async (
  perServing: NutritionValues,
  grams: number,
  learned: LearnedMeasures,
): Promise<NutritionRead> => {
  const values = scalePerServingToPer100g(perServing, grams);
  const { flags } = await getProvider().validate(values);
  return { kind: "per100g", values, flags, learned };
};

const contextFor = async (productName: string): Promise<MeasureContext> => ({
  productName,
  ...(await findStoredMeasures(productName)),
});

// A guess, never a substitute for asking: only reached once every other
// resolution strategy has already failed, and always lands as an editable
// prefill on the serving-size question, not an auto-submitted answer.
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

// Mirrors scaledRead's already-established shape: a small pure-orchestration
// wrapper the resolved-serving branch below delegates to, kept separate so it
// can be exercised directly by a unit test. Every export from a "use server"
// file is independently reachable as its own Server Action from the client
// regardless of which other function calls it internally, so this checks
// auth itself rather than trusting fromUsLabel's caller to have done it.
export const fromResolvedServing = async (
  perServing: NutritionValues,
  servingSizeText: string,
  grams: number,
): Promise<NutritionRead> => {
  await requireUserId();
  const learned = learnFromServing(servingSizeText, grams);
  return scaledRead(perServing, grams, learned);
};

// Kept separate from fromUsLabel purely for the line budget - exported so
// it can be exercised directly, same as fromResolvedServing above it. Same
// auth rationale as fromResolvedServing: independently reachable from the
// client once exported from a "use server" file.
export const needsServingSizeRead = async (
  read: Extract<NutritionTableRead, { format: "us" }>,
  netWeightText: string | null,
  context: MeasureContext,
): Promise<NutritionRead> => {
  await requireUserId();
  return {
    kind: "needs-serving-size",
    servingSizeText: read.servingSizeText,
    perServing: read.perServing,
    prefillGrams: netWeightPrefill(netWeightText, read.servingsPerContainer, context),
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
    return await needsServingSizeRead(read, netWeightText, context);
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
    return { kind: "per100g", values: read.per100g, flags: read.flags, learned: NOTHING_LEARNED };
  }
  return fromUsLabel(read, productNameGuess, netWeightText);
};

/**
 * Resolve the user's own answer to the serving-size question.
 *
 * The answer is fed back through the same resolver, so "1.8 oz" works as well
 * as "52g" - useful because US packages frequently print net weight in
 * ounces. An answer that still cannot be resolved asks again rather than
 * inventing a number.
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
    // prefillGrams is unused here: ServingSizeStep only checks read.kind on
    // this branch and re-shows its own local error, never re-reading these
    // fields (same as servingSizeText/perServing above).
    return { kind: "needs-serving-size", servingSizeText, perServing, prefillGrams: null };
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
