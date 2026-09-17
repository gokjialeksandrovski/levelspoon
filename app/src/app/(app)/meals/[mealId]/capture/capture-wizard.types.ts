import type { LookupBarcodeResult } from "@/features/products/actions/barcode";
import type { MatchResult } from "@/features/products/actions/products";
import { NOTHING_LEARNED } from "@/lib/measures/learn";
import type { LearnedMeasures } from "@/lib/measures/learn";
import type { NullableNutritionValues } from "@/lib/ocr/provider";
import type { NutritionValues } from "@/types/nutrition";

export interface SelectedProduct {
  id: string;
  name: string;
  densityGMl: number | null;
  servingUnit: string | null;
  servingGrams: number | null;
  nutritionBasisUnit: string;
}

export type NutritionOrigin = "label_photo" | "manual" | "open_food_facts";

export type WizardStep =
  | { kind: "product-photo"; pendingBarcode: string | null }
  /** Steps, not local modes of product-photo: only what sits on the path can
   * be popped by "Back", and as local state these left Back exiting the
   * wizard entirely. */
  | { kind: "product-manual"; pendingBarcode: string | null }
  | { kind: "product-barcode"; pendingBarcode: string | null }
  | { kind: "standard-food-search" }
  | {
      kind: "match-result";
      nameGuess: string;
      candidates: SelectedProduct[];
      /** The front photo's own net-weight declaration, carried forward in
       * case the user rejects every candidate and lands back on the
       * nutrition-photo step. */
      netWeightText: string | null;
      /** A barcode scanned earlier that neither source recognised - carried
       * so choosing a candidate here still offers linking it (barcode spec
       * §7, T4). */
      pendingBarcode: string | null;
    }
  | { kind: "nutrition-photo"; nameGuess: string; netWeightText: string | null; pendingBarcode: string | null }
  | {
      kind: "serving-size";
      servingSizeText: string;
      perServing: NutritionValues;
      name: string;
      photo: Blob;
      /** A net-weight-derived guess for the ask step's input, or null when
       * unavailable - always editable, never auto-submitted. */
      prefillGrams: number | null;
      /** The household unit recognised but not yet convertible for this
       * product (e.g. "tbsp" with no known density), or null when the label
       * text didn't parse as a measurement at all. */
      unitName: string | null;
      pendingBarcode: string | null;
    }
  | {
      kind: "confirm";
      parsed: NullableNutritionValues;
      flags: string[];
      name: string;
      /** Absent for a barcode's Open Food Facts hit - no label photo was
       * ever taken (barcode spec §4). */
      photo?: Blob;
      learned: LearnedMeasures;
      nutritionBasisUnit: string;
      nutritionBasisQuantity: number;
      /** A barcode scanned earlier in this capture that neither per100 nor
       * Open Food Facts recognised - shown at confirm as a declinable
       * opt-in, never auto-attached (barcode spec §7; T4 renders the
       * checkbox, this step shape only carries the value there). */
      pendingBarcode: string | null;
      /** A barcode already confirmed (internal or Open Food Facts match) -
       * attaches on save with no opt-out, since the user's own scan already
       * resolved it (barcode spec §7). */
      barcode: string | null;
      nutritionOrigin: NutritionOrigin | null;
    }
  | {
      kind: "amount";
      product: SelectedProduct;
      alternatives: SelectedProduct[];
      /** Non-null only when arriving via a confident/chosen match after an
       * earlier not_found scan - AmountStep offers linking it to `product`
       * (barcode spec §7, T4). Null on every other arrival (whole food,
       * freshly-created product, internal-match scan) - nothing left to
       * offer. */
      pendingBarcode: string | null;
    }
  | { kind: "saved" };

export type WizardAction =
  | { type: "MATCH_RESOLVED"; nameGuess: string; result: MatchResult; netWeightText: string | null; pendingBarcode: string | null }
  | { type: "CANDIDATE_CHOSEN"; product: SelectedProduct; alternatives: SelectedProduct[]; pendingBarcode: string | null }
  | { type: "NONE_OF_THESE"; nameGuess: string; netWeightText: string | null; pendingBarcode: string | null }
  | {
      type: "SERVING_SIZE_NEEDED";
      servingSizeText: string;
      perServing: NutritionValues;
      name: string;
      photo: Blob;
      prefillGrams: number | null;
      unitName: string | null;
      pendingBarcode: string | null;
    }
  | {
      type: "NUTRITION_PARSED";
      parsed: NullableNutritionValues;
      flags: string[];
      name: string;
      photo: Blob;
      learned: LearnedMeasures;
      nutritionBasisUnit: string;
      nutritionBasisQuantity: number;
      pendingBarcode: string | null;
    }
  | { type: "PRODUCT_CREATED"; product: SelectedProduct }
  | { type: "SAVED" }
  | { type: "ADD_ANOTHER" }
  | { type: "CHANGE_MATCH"; nameGuess: string; candidates: SelectedProduct[]; pendingBarcode: string | null }
  | { type: "WHOLE_FOOD_SEARCH" }
  | { type: "WHOLE_FOOD_CHOSEN"; product: SelectedProduct }
  | { type: "MANUAL_NAME_ENTRY"; pendingBarcode: string | null }
  | { type: "BARCODE_ENTRY"; pendingBarcode: string | null }
  | { type: "BARCODE_SCANNED"; result: Exclude<LookupBarcodeResult, { kind: "rejected" }> };

export const INITIAL_WIZARD_STEP: WizardStep = { kind: "product-photo", pendingBarcode: null };

/** Shared so the three screens offering this route don't each word it differently. */
export const BACK_TO_OPTIONS_LABEL = "Choose a different way";

export const toSelectedProduct = (candidate: {
  id: string;
  name: string;
  densityGMl: number | null;
  servingUnit: string | null;
  servingGrams: number | null;
  nutritionBasisUnit: string;
}): SelectedProduct => ({
  id: candidate.id,
  name: candidate.name,
  densityGMl: candidate.densityGMl,
  servingUnit: candidate.servingUnit,
  servingGrams: candidate.servingGrams,
  nutritionBasisUnit: candidate.nutritionBasisUnit,
});

const resolveMatch = (
  nameGuess: string,
  result: MatchResult,
  netWeightText: string | null,
  pendingBarcode: string | null,
): WizardStep => {
  if (result.kind === "confident") return { kind: "amount", product: toSelectedProduct(result.product), alternatives: result.alternatives.map(toSelectedProduct), pendingBarcode };
  if (result.kind === "ambiguous") return { kind: "match-result", nameGuess, candidates: result.candidates.map(toSelectedProduct), netWeightText, pendingBarcode };
  return { kind: "nutrition-photo", nameGuess, netWeightText, pendingBarcode };
};

// Extracted from wizardReducer's switch (below) so that switch keeps its
// one-case-per-line shape - covered by the reducer's own tests, not exported.
const applyServingSizeNeeded = (action: Extract<WizardAction, { type: "SERVING_SIZE_NEEDED" }>): WizardStep => ({
  kind: "serving-size",
  servingSizeText: action.servingSizeText,
  perServing: action.perServing,
  name: action.name,
  photo: action.photo,
  prefillGrams: action.prefillGrams,
  unitName: action.unitName,
  pendingBarcode: action.pendingBarcode,
});

const applyNutritionParsed = (action: Extract<WizardAction, { type: "NUTRITION_PARSED" }>): WizardStep => ({
  kind: "confirm",
  parsed: action.parsed,
  flags: action.flags,
  name: action.name,
  photo: action.photo,
  learned: action.learned,
  nutritionBasisUnit: action.nutritionBasisUnit,
  nutritionBasisQuantity: action.nutritionBasisQuantity,
  pendingBarcode: action.pendingBarcode,
  barcode: null,
  nutritionOrigin: null,
});

const applyChangeMatch = (action: Extract<WizardAction, { type: "CHANGE_MATCH" }>): WizardStep => ({
  // From the amount step, which never carried a net weight - nothing to
  // forward there. A pending barcode does carry forward (T4).
  kind: "match-result",
  nameGuess: action.nameGuess,
  candidates: action.candidates,
  netWeightText: null,
  pendingBarcode: action.pendingBarcode,
});

type ResolvedBarcodeLookup = Extract<WizardAction, { type: "BARCODE_SCANNED" }>["result"];

const EXTERNAL_MATCH_BASIS_QUANTITY = 100;

// A barcode already known-good (internal or Open Food Facts) attaches on
// save with no opt-out; a barcode neither source recognised threads through
// as pendingBarcode instead, surfaced at confirm as a declinable checkbox
// (T4) - the two never overlap on the same step (barcode spec §3, §7).
const applyBarcodeScanned = (result: ResolvedBarcodeLookup): WizardStep => {
  switch (result.kind) {
    case "internal_match":
      return { kind: "amount", product: toSelectedProduct(result.product), alternatives: [], pendingBarcode: null };
    case "external_match":
      return { kind: "confirm", parsed: result.nutritionPer100g, flags: result.flags, name: result.nameGuess, photo: undefined, learned: NOTHING_LEARNED, nutritionBasisUnit: result.nutritionBasisUnit, nutritionBasisQuantity: EXTERNAL_MATCH_BASIS_QUANTITY, pendingBarcode: null, barcode: result.barcode, nutritionOrigin: "open_food_facts" };
    case "not_found":
      return { kind: "product-photo", pendingBarcode: result.barcode };
  }
};

// One case per line, not this repo's usual two-line style - keeps the state
// transition table scannable at a glance (kept even after the line-count
// rule was dropped).
export const wizardReducer = (_state: WizardStep, action: WizardAction): WizardStep => {
  switch (action.type) {
    case "MATCH_RESOLVED": return resolveMatch(action.nameGuess, action.result, action.netWeightText, action.pendingBarcode);
    case "CANDIDATE_CHOSEN": return { kind: "amount", product: action.product, alternatives: action.alternatives, pendingBarcode: action.pendingBarcode };
    case "NONE_OF_THESE": return { kind: "nutrition-photo", nameGuess: action.nameGuess, netWeightText: action.netWeightText, pendingBarcode: action.pendingBarcode };
    case "SERVING_SIZE_NEEDED": return applyServingSizeNeeded(action);
    case "NUTRITION_PARSED": return applyNutritionParsed(action);
    case "PRODUCT_CREATED": return { kind: "amount", product: action.product, alternatives: [], pendingBarcode: null };
    case "SAVED": return { kind: "saved" };
    case "ADD_ANOTHER": return { kind: "product-photo", pendingBarcode: null };
    case "CHANGE_MATCH": return applyChangeMatch(action);
    case "WHOLE_FOOD_SEARCH": return { kind: "standard-food-search" };
    case "WHOLE_FOOD_CHOSEN": return { kind: "amount", product: action.product, alternatives: [], pendingBarcode: null };
    case "MANUAL_NAME_ENTRY": return { kind: "product-manual", pendingBarcode: action.pendingBarcode };
    case "BARCODE_ENTRY": return { kind: "product-barcode", pendingBarcode: action.pendingBarcode };
    case "BARCODE_SCANNED": return applyBarcodeScanned(action.result);
  }
};
