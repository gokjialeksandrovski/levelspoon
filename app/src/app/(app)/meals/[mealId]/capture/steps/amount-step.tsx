// app/src/app/meals/[mealId]/steps/amount-step.tsx
"use client";

import { useState } from "react";

import { saveMealIngredient } from "@/actions/meals";
import { estimateQuantity } from "@/actions/quantity";
import { Button } from "@/components/button";
import { Field } from "@/components/field";
import { InlineMessage } from "@/components/inline-message";
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
    } catch (error) {
      console.error("Quantity estimation failed", error);
      setError("Could not estimate the amount - enter it manually.");
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
    } catch (error) {
      console.error("Saving the meal ingredient failed", error);
      setError("Could not save this ingredient. Please try again.");
    } finally {
      setIsBusy(false);
    }
  };

  const changeMatch = () =>
    dispatch({ type: "CHANGE_MATCH", nameGuess: product.name, candidates: [product, ...alternatives] });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Using {product.name}</h2>
        {alternatives.length > 0 && (
          <button type="button" onClick={changeMatch} className="text-sm text-text-muted underline">
            Change?
          </button>
        )}
      </div>
      <PhotoInput label="Amount photo (optional)" onSelect={handlePhoto} />
      <Field
        label="Amount (g)"
        name="grams"
        type="number"
        value={grams}
        onChange={(event) => {
          setGrams(event.target.value);
          setSource("manual");
        }}
      />
      {error && <InlineMessage tone="error">{error}</InlineMessage>}
      <Button disabled={isBusy || grams.trim() === ""} onClick={handleSave}>
        Save ingredient
      </Button>
    </div>
  );
};
