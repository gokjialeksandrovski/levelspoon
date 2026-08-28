// app/src/app/meals/[mealId]/steps/amount-step.tsx
"use client";

import { useState } from "react";

import { saveMealIngredient } from "@/actions/meals";
import { estimateQuantity } from "@/actions/quantity";
import { PhotoInput } from "@/components/photo-input";

import type { SelectedProduct, WizardAction } from "../capture-wizard.types";

interface AmountStepProps {
  mealId: string;
  product: SelectedProduct;
  alternatives: SelectedProduct[];
  dispatch: (action: WizardAction) => void;
  onSaved: () => void;
}

export const AmountStep = ({ mealId, product, alternatives, dispatch, onSaved }: AmountStepProps) => {
  const [grams, setGrams] = useState("");
  const [source, setSource] = useState<"ai_estimated" | "manual">("manual");
  const [error, setError] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);

  const handlePhoto = async (photo: File) => {
    setIsBusy(true);
    setError(null);
    try {
      const { grams: estimated } = await estimateQuantity(photo);
      setGrams(String(estimated));
      setSource("ai_estimated");
    } catch {
      setError("Could not estimate the amount — enter it manually.");
    } finally {
      setIsBusy(false);
    }
  };

  const handleSave = async () => {
    setError(null);
    setIsBusy(true);
    try {
      await saveMealIngredient({ mealId, productId: product.id, quantityG: Number(grams), quantitySource: source });
      dispatch({ type: "SAVED" });
      onSaved();
    } catch {
      setError("Could not save this ingredient. Please try again.");
    } finally {
      setIsBusy(false);
    }
  };

  const changeMatch = () =>
    dispatch({ type: "CHANGE_MATCH", nameGuess: product.name, candidates: [product, ...alternatives] });

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h2 className="font-medium">Using {product.name}</h2>
        {alternatives.length > 0 && (
          <button type="button" onClick={changeMatch} className="text-sm text-blue-600">
            Change?
          </button>
        )}
      </div>
      <PhotoInput label="Amount photo (optional)" onSelect={handlePhoto} />
      <div className="flex flex-col gap-1">
        <label htmlFor="grams" className="text-sm font-medium text-gray-700">
          Amount (g)
        </label>
        <input
          id="grams"
          type="number"
          value={grams}
          onChange={(event) => {
            setGrams(event.target.value);
            setSource("manual");
          }}
          className="rounded border border-gray-300 px-3 py-2"
        />
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <button
        type="button"
        disabled={isBusy || grams.trim() === ""}
        onClick={handleSave}
        className="rounded bg-blue-600 px-4 py-2 text-white disabled:opacity-50"
      >
        Save ingredient
      </button>
    </div>
  );
};
