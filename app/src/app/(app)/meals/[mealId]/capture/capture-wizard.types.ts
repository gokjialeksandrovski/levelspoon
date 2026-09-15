import type { MatchResult } from "@/features/products/actions/products";
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

export type WizardStep =
  | { kind: "product-photo" }
  | { kind: "standard-food-search" }
  | {
      kind: "match-result";
      nameGuess: string;
      candidates: SelectedProduct[];
      /** The front photo's own net-weight declaration, carried forward in
       * case the user rejects every candidate and lands back on the
       * nutrition-photo step. */
      netWeightText: string | null;
    }
  | { kind: "nutrition-photo"; nameGuess: string; netWeightText: string | null }
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
    }
  | {
      kind: "confirm";
      parsed: NullableNutritionValues;
      flags: string[];
      name: string;
      photo: Blob;
      learned: LearnedMeasures;
      nutritionBasisUnit: string;
      nutritionBasisQuantity: number;
    }
  | { kind: "amount"; product: SelectedProduct; alternatives: SelectedProduct[] }
  | { kind: "saved" };

export type WizardAction =
  | { type: "MATCH_RESOLVED"; nameGuess: string; result: MatchResult; netWeightText: string | null }
  | { type: "CANDIDATE_CHOSEN"; product: SelectedProduct; alternatives: SelectedProduct[] }
  | { type: "NONE_OF_THESE"; nameGuess: string; netWeightText: string | null }
  | {
      type: "SERVING_SIZE_NEEDED";
      servingSizeText: string;
      perServing: NutritionValues;
      name: string;
      photo: Blob;
      prefillGrams: number | null;
      unitName: string | null;
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
    }
  | { type: "PRODUCT_CREATED"; product: SelectedProduct }
  | { type: "SAVED" }
  | { type: "ADD_ANOTHER" }
  | { type: "CHANGE_MATCH"; nameGuess: string; candidates: SelectedProduct[] }
  | { type: "WHOLE_FOOD_SEARCH" }
  | { type: "WHOLE_FOOD_CHOSEN"; product: SelectedProduct };

export const INITIAL_WIZARD_STEP: WizardStep = { kind: "product-photo" };

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

const resolveMatch = (nameGuess: string, result: MatchResult, netWeightText: string | null): WizardStep => {
  if (result.kind === "confident") {
    return {
      kind: "amount",
      product: toSelectedProduct(result.product),
      alternatives: result.alternatives.map(toSelectedProduct),
    };
  }
  if (result.kind === "ambiguous") {
    return {
      kind: "match-result",
      nameGuess,
      candidates: result.candidates.map(toSelectedProduct),
      netWeightText,
    };
  }
  return { kind: "nutrition-photo", nameGuess, netWeightText };
};

// Extracted from wizardReducer's switch (below) only to keep that function
// under the line budget - covered by the reducer's own tests, not exported.
const applyServingSizeNeeded = (action: Extract<WizardAction, { type: "SERVING_SIZE_NEEDED" }>): WizardStep => ({
  kind: "serving-size",
  servingSizeText: action.servingSizeText,
  perServing: action.perServing,
  name: action.name,
  photo: action.photo,
  prefillGrams: action.prefillGrams,
  unitName: action.unitName,
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
});

const applyChangeMatch = (action: Extract<WizardAction, { type: "CHANGE_MATCH" }>): WizardStep => ({
  // Starts from the amount step, which never had a front-panel net weight to
  // begin with - a SelectedProduct only ever carries id/name - so there is
  // nothing to carry forward here.
  kind: "match-result",
  nameGuess: action.nameGuess,
  candidates: action.candidates,
  netWeightText: null,
});

// One case per line (label and return together) rather than this repo's
// usual two-line case style - with 9 cases, the two-line form alone put
// this switch 2 lines over budget even after extracting the three longest
// branches above. Every branch is already a single expression, so this
// only changes formatting, not structure.
export const wizardReducer = (_state: WizardStep, action: WizardAction): WizardStep => {
  switch (action.type) {
    case "MATCH_RESOLVED": return resolveMatch(action.nameGuess, action.result, action.netWeightText);
    case "CANDIDATE_CHOSEN": return { kind: "amount", product: action.product, alternatives: action.alternatives };
    case "NONE_OF_THESE": return { kind: "nutrition-photo", nameGuess: action.nameGuess, netWeightText: action.netWeightText };
    case "SERVING_SIZE_NEEDED": return applyServingSizeNeeded(action);
    case "NUTRITION_PARSED": return applyNutritionParsed(action);
    case "PRODUCT_CREATED": return { kind: "amount", product: action.product, alternatives: [] };
    case "SAVED": return { kind: "saved" };
    case "ADD_ANOTHER": return { kind: "product-photo" };
    case "CHANGE_MATCH": return applyChangeMatch(action);
    case "WHOLE_FOOD_SEARCH": return { kind: "standard-food-search" };
    case "WHOLE_FOOD_CHOSEN": return { kind: "amount", product: action.product, alternatives: [] };
  }
};
