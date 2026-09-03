// app/src/app/meals/[mealId]/capture-wizard.types.ts
import type { MatchResult, NutritionValues } from "@/actions/products";
import type { LearnedMeasures } from "@/lib/measures/learn";
import type { NullableNutritionValues } from "@/lib/ocr/provider";

export interface SelectedProduct {
  id: string;
  name: string;
}

export type WizardStep =
  | { kind: "product-photo" }
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
    }
  | {
      kind: "confirm";
      parsed: NullableNutritionValues;
      flags: string[];
      name: string;
      photo: Blob;
      learned: LearnedMeasures;
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
    }
  | {
      type: "NUTRITION_PARSED";
      parsed: NullableNutritionValues;
      flags: string[];
      name: string;
      photo: Blob;
      learned: LearnedMeasures;
    }
  | { type: "PRODUCT_CREATED"; product: SelectedProduct }
  | { type: "SAVED" }
  | { type: "ADD_ANOTHER" }
  | { type: "CHANGE_MATCH"; nameGuess: string; candidates: SelectedProduct[] };

export const INITIAL_WIZARD_STEP: WizardStep = { kind: "product-photo" };

const toSelectedProduct = (candidate: { id: string; name: string }): SelectedProduct => ({
  id: candidate.id,
  name: candidate.name,
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

export const wizardReducer = (_state: WizardStep, action: WizardAction): WizardStep => {
  switch (action.type) {
    case "MATCH_RESOLVED":
      return resolveMatch(action.nameGuess, action.result, action.netWeightText);
    case "CANDIDATE_CHOSEN":
      return { kind: "amount", product: action.product, alternatives: action.alternatives };
    case "NONE_OF_THESE":
      return { kind: "nutrition-photo", nameGuess: action.nameGuess, netWeightText: action.netWeightText };
    case "SERVING_SIZE_NEEDED":
      return {
        kind: "serving-size",
        servingSizeText: action.servingSizeText,
        perServing: action.perServing,
        name: action.name,
        photo: action.photo,
        prefillGrams: action.prefillGrams,
      };
    case "NUTRITION_PARSED":
      return {
        kind: "confirm",
        parsed: action.parsed,
        flags: action.flags,
        name: action.name,
        photo: action.photo,
        learned: action.learned,
      };
    case "PRODUCT_CREATED":
      return { kind: "amount", product: action.product, alternatives: [] };
    case "SAVED":
      return { kind: "saved" };
    case "ADD_ANOTHER":
      return { kind: "product-photo" };
    case "CHANGE_MATCH":
      // Starts from the amount step, which never had a front-panel net
      // weight to begin with - a SelectedProduct only ever carries id/name -
      // so there is nothing to carry forward here.
      return {
        kind: "match-result",
        nameGuess: action.nameGuess,
        candidates: action.candidates,
        netWeightText: null,
      };
  }
};
