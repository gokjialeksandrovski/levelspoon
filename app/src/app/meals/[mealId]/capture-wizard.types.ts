// app/src/app/meals/[mealId]/capture-wizard.types.ts
import type { MatchResult, NutritionValues } from "@/actions/products";
import type { NullableNutritionValues } from "@/lib/ocr/provider";

export interface SelectedProduct {
  id: string;
  name: string;
}

export type WizardStep =
  | { kind: "product-photo" }
  | { kind: "match-result"; nameGuess: string; candidates: SelectedProduct[] }
  | { kind: "nutrition-photo"; nameGuess: string }
  | { kind: "confirm"; parsed: NullableNutritionValues; flags: string[]; name: string; photo: Blob }
  | { kind: "amount"; product: SelectedProduct; alternatives: SelectedProduct[] }
  | { kind: "saved" };

export type WizardAction =
  | { type: "MATCH_RESOLVED"; nameGuess: string; result: MatchResult }
  | { type: "CANDIDATE_CHOSEN"; product: SelectedProduct; alternatives: SelectedProduct[] }
  | { type: "NONE_OF_THESE"; nameGuess: string }
  | { type: "NUTRITION_PARSED"; parsed: NullableNutritionValues; flags: string[]; name: string; photo: Blob }
  | { type: "PRODUCT_CREATED"; product: SelectedProduct }
  | { type: "SAVED" }
  | { type: "ADD_ANOTHER" }
  | { type: "CHANGE_MATCH"; nameGuess: string; candidates: SelectedProduct[] };

export const INITIAL_WIZARD_STEP: WizardStep = { kind: "product-photo" };

const toSelectedProduct = (candidate: { id: string; name: string }): SelectedProduct => ({
  id: candidate.id,
  name: candidate.name,
});

const resolveMatch = (nameGuess: string, result: MatchResult): WizardStep => {
  if (result.kind === "confident") {
    return {
      kind: "amount",
      product: toSelectedProduct(result.product),
      alternatives: result.alternatives.map(toSelectedProduct),
    };
  }
  if (result.kind === "ambiguous") {
    return { kind: "match-result", nameGuess, candidates: result.candidates.map(toSelectedProduct) };
  }
  return { kind: "nutrition-photo", nameGuess };
};

export const wizardReducer = (_state: WizardStep, action: WizardAction): WizardStep => {
  switch (action.type) {
    case "MATCH_RESOLVED":
      return resolveMatch(action.nameGuess, action.result);
    case "CANDIDATE_CHOSEN":
      return { kind: "amount", product: action.product, alternatives: action.alternatives };
    case "NONE_OF_THESE":
      return { kind: "nutrition-photo", nameGuess: action.nameGuess };
    case "NUTRITION_PARSED":
      return { kind: "confirm", parsed: action.parsed, flags: action.flags, name: action.name, photo: action.photo };
    case "PRODUCT_CREATED":
      return { kind: "amount", product: action.product, alternatives: [] };
    case "SAVED":
      return { kind: "saved" };
    case "ADD_ANOTHER":
      return { kind: "product-photo" };
    case "CHANGE_MATCH":
      return { kind: "match-result", nameGuess: action.nameGuess, candidates: action.candidates };
  }
};
