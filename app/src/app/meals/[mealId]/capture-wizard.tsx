// app/src/app/meals/[mealId]/capture-wizard.tsx
"use client";

import { useReducer } from "react";
import { useRouter } from "next/navigation";

import { INITIAL_WIZARD_STEP, wizardReducer } from "./capture-wizard.types";
import { AmountStep } from "./steps/amount-step";
import { ConfirmStep } from "./steps/confirm-step";
import { MatchResultStep } from "./steps/match-result-step";
import { NutritionPhotoStep } from "./steps/nutrition-photo-step";
import { ProductNameStep } from "./steps/product-name-step";

interface CaptureWizardProps {
  mealId: string;
  onIngredientSaved?: () => void;
}

export const CaptureWizard = ({ mealId, onIngredientSaved }: CaptureWizardProps) => {
  const [step, dispatch] = useReducer(wizardReducer, INITIAL_WIZARD_STEP);
  const router = useRouter();

  if (step.kind === "product-photo") {
    return <ProductNameStep dispatch={dispatch} />;
  }
  if (step.kind === "match-result") {
    return <MatchResultStep nameGuess={step.nameGuess} candidates={step.candidates} dispatch={dispatch} />;
  }
  if (step.kind === "nutrition-photo") {
    return <NutritionPhotoStep nameGuess={step.nameGuess} dispatch={dispatch} />;
  }
  if (step.kind === "confirm") {
    return (
      <ConfirmStep name={step.name} parsed={step.parsed} flags={step.flags} photo={step.photo} dispatch={dispatch} />
    );
  }
  if (step.kind === "amount") {
    return (
      <AmountStep
        mealId={mealId}
        product={step.product}
        alternatives={step.alternatives}
        dispatch={dispatch}
        onSaved={() => {
          router.refresh();
          onIngredientSaved?.();
        }}
      />
    );
  }
  return (
    <div className="flex flex-col gap-3">
      <p className="text-green-700">Ingredient saved.</p>
      <button type="button" onClick={() => dispatch({ type: "ADD_ANOTHER" })} className="rounded bg-blue-600 px-4 py-2 text-white">
        Add another ingredient
      </button>
    </div>
  );
};
