"use server";

import { headers } from "next/headers";

import type { NutritionValues } from "@/types/nutrition";
import { findStoredMeasures } from "@/features/products/actions/products";
import { requireUser, requireUserId } from "@/lib/auth/require-user";
import { clientIp, takeDemoScan } from "@/lib/db/demo-quota";
import { photoKeysFor } from "@/lib/db/photo-keys";
import { findPhotoOwner } from "@/lib/db/photo-owner";
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
import {
  isUnreadablePhoto,
  type NullableNutritionValues,
  type NutritionTableRead,
  type OcrProvider,
  type UnreadablePhoto,
} from "@/lib/ocr/provider";

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
    }
  | {
      kind: "photo-already-used";
      /** Null when the row holding this photo is not one this user may be
       * shown - see findPhotoOwner. */
      ownerName: string | null;
    }
  | DemoLimitReached
  | UnreadablePhoto;

/** A demo user's scans for today are spent (lib/db/demo-quota.ts). */
export interface DemoLimitReached {
  kind: "demo-limit";
}

export type ProductNameRead =
  | { kind: "read"; text: string; netWeightText: string | null }
  | DemoLimitReached
  | UnreadablePhoto;

const DEMO_LIMIT: DemoLimitReached = { kind: "demo-limit" };

// Only demo users count: OCR runs on the developer's home server.
const takeScanIfGuest = async (isGuest: boolean): Promise<boolean> =>
  !isGuest || takeDemoScan(clientIp(await headers()));

const getProvider = (): OcrProvider =>
  process.env.OCR_PROVIDER === "mock" ? new MockOcrProvider() : new HttpOcrProvider();

export const ocrProductName = async (photo: Blob): Promise<ProductNameRead> => {
  const { isGuest } = await requireUser();
  if (!(await takeScanIfGuest(isGuest))) {
    return DEMO_LIMIT;
  }
  const read = await getProvider().extractProductName(photo);
  return isUnreadablePhoto(read) ? read : { kind: "read", ...read };
};

type ScaledRead = Exclude<NutritionRead, { kind: "photo-already-used" | "demo-limit" | "unreadable-photo" }>;

const GRAM_BASIS_UNIT = "g";
const PER_100_BASIS_QUANTITY = 100;
const PER_UNIT_BASIS_QUANTITY = 1;

const scaledRead = async (
  perServing: NutritionValues,
  grams: number,
  learned: LearnedMeasures,
): Promise<ScaledRead> => {
  const values = scalePerServingToPer100g(perServing, grams);
  const { flags } = await getProvider().validate(values);
  return {
    kind: "per100g",
    values,
    flags,
    learned,
    nutritionBasisUnit: GRAM_BASIS_UNIT,
    nutritionBasisQuantity: PER_100_BASIS_QUANTITY,
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
): Promise<ScaledRead> => {
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

// Zero/negative quantity is "recognized unit, unusable amount" - fast-pathing
// it into perUnitRead would divide by zero and write Infinity into the
// shared products table, so the fallback requires a genuinely positive quantity.
const isPerUnitFallback = (
  resolution: Extract<Resolution, { kind: "unresolved" }>,
): resolution is Extract<Resolution, { kind: "unresolved" }> & { unitName: string; quantity: number } =>
  resolution.unitName !== null && resolution.quantity !== null && resolution.quantity > 0;

const contextFor = async (productName: string): Promise<MeasureContext> => ({
  productName,
  nutritionBasisUnit: GRAM_BASIS_UNIT,
  // OCR resolves printed label text, never a tapped portion.
  portions: [],
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

// Exported for direct unit-testing; checks auth itself since every export
// from a "use server" file is independently reachable as its own Server Action.
export const fromResolvedServing = async (
  perServing: NutritionValues,
  servingSizeText: string,
  grams: number,
): Promise<NutritionRead> => {
  await requireUserId();
  const learned = learnFromServing(servingSizeText, grams);
  return scaledRead(perServing, grams, learned);
};

// Kept separate from fromUsLabel so this branch's own prefill-guess logic
// has direct test coverage (ocr.test.ts) instead of only being reachable
// through the full US-label flow; exported and auth-checked for the same
// reason as fromResolvedServing.
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
  // A printed weight is the label's most certain figure, and free density
  // data when paired with a volume - no user input or AI needed.
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
  // Brand-new row (all learned columns NULL): persisting the resolved density
  // now lets the next scan of this product read it straight from its own row.
  const fromLabel = learnFromServing(read.servingSizeText, resolution.grams);
  const learned = hasLearned(fromLabel) ? fromLabel : NOTHING_LEARNED;
  return scaledRead(read.perServing, resolution.grams, learned);
};

export const ocrNutritionTable = async (
  photo: Blob,
  productNameGuess: string,
  netWeightText: string | null = null,
): Promise<NutritionRead> => {
  const { id: userId, isGuest } = await requireUser();
  const buffer = Buffer.from(await photo.arrayBuffer());
  const { proofKey, claimKey } = photoKeysFor(buffer);
  // Refused before the OCR call, not after: the answer would be the other
  // product's figures, and reading them is what makes the mistake look right.
  const owner = await findPhotoOwner([proofKey, claimKey], userId);
  if (owner) {
    return { kind: "photo-already-used", ownerName: owner.name };
  }
  if (!(await takeScanIfGuest(isGuest))) {
    return DEMO_LIMIT;
  }
  const read = await getProvider().extractNutritionTable(photo);
  if (isUnreadablePhoto(read)) {
    return read;
  }
  if (read.format === "eu") {
    return {
      kind: "per100g",
      values: read.per100g,
      flags: read.flags,
      learned: NOTHING_LEARNED,
      nutritionBasisUnit: read.basisUnit,
      nutritionBasisQuantity: PER_100_BASIS_QUANTITY,
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
): Promise<ScaledRead> => {
  await requireUserId();
  const resolution = resolveGrams(answerText, await contextFor(productNameGuess));
  if (resolution.kind === "unresolved") {
    if (isPerUnitFallback(resolution)) {
      return perUnitRead(perServing, resolution.unitName, resolution.quantity);
    }
    // prefillGrams unused here: ServingSizeStep only checks read.kind on this
    // branch and re-shows its own local error.
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
