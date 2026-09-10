// app/src/app/meals/[mealId]/steps/amount-step.tsx
"use client";

import { useState } from "react";

import { saveMealIngredient } from "@/actions/meals";
import { estimateQuantity } from "@/actions/quantity";
import { Button } from "@/components/button";
import { Field } from "@/components/field";
import { InlineMessage } from "@/components/inline-message";
import { PhotoInput } from "@/components/photo-input";
import { TAP_HIT_AREA_SM } from "@/components/tap-target";
import { triggerLogSuccessHaptic } from "@/lib/haptics/log-success";

import type { SelectedProduct, WizardAction } from "../capture-wizard.types";

interface AmountStepProps {
  mealId: string;
  product: SelectedProduct;
  alternatives: SelectedProduct[];
  dispatch: (action: WizardAction) => void;
  onSaved: () => void;
}

interface AmountStepHeaderProps {
  productName: string;
  hasAlternatives: boolean;
  onChangeMatch: () => void;
}

const AmountStepHeader = ({ productName, hasAlternatives, onChangeMatch }: AmountStepHeaderProps) => (
  <div className="flex items-center justify-between">
    <h2 className="text-lg font-semibold">Using {productName}</h2>
    {hasAlternatives && (
      <button type="button" onClick={onChangeMatch} className={`${TAP_HIT_AREA_SM} text-sm text-text-muted underline`}>
        Change?
      </button>
    )}
  </div>
);

interface AmountFieldProps {
  grams: string;
  error: string | null;
  onGramsChange: (value: string) => void;
}

const AmountField = ({ grams, error, onGramsChange }: AmountFieldProps) => (
  <>
    <Field
      label="Amount (g)"
      name="grams"
      type="number"
      value={grams}
      onChange={(event) => onGramsChange(event.target.value)}
    />
    {error && <InlineMessage tone="error">{error}</InlineMessage>}
  </>
);

interface AmountStepCallbacks {
  setError: (error: string | null) => void;
  setIsBusy: (isBusy: boolean) => void;
}

// Standalone (not a hook) so useAmountStepForm's own body stays under the
// line budget - takes a bundled callbacks object rather than a hook's
// internal state, mirroring ingredient-row.tsx's existing callback-
// injection shape (MutationCallbacks).
const estimateAmount = async (photo: File, onEstimated: (value: string) => void, callbacks: AmountStepCallbacks): Promise<void> => {
  callbacks.setIsBusy(true);
  callbacks.setError(null);
  try {
    const { grams: estimated } = await estimateQuantity(photo);
    onEstimated(String(estimated));
  } catch (error) {
    console.error("Quantity estimation failed", error);
    callbacks.setError("Could not estimate the amount - enter it manually.");
  } finally {
    callbacks.setIsBusy(false);
  }
};

interface SaveAmountInput {
  mealId: string;
  productId: string;
  grams: string;
  source: "ai_estimated" | "manual";
}

// Exported (was previously module-private) so amount-step.test.ts can call
// it directly, same posture as this file's existing estimateAmount.
export const saveAmount = async (input: SaveAmountInput, dispatch: (action: WizardAction) => void, onSaved: () => void, callbacks: AmountStepCallbacks): Promise<void> => {
  callbacks.setError(null);
  callbacks.setIsBusy(true);
  try {
    await saveMealIngredient({ mealId: input.mealId, productId: input.productId, quantityG: Number(input.grams), quantitySource: input.source });
    triggerLogSuccessHaptic();
    dispatch({ type: "SAVED" });
    onSaved();
  } catch (error) {
    console.error("Saving the meal ingredient failed", error);
    callbacks.setError("Could not save this ingredient. Please try again.");
  } finally {
    callbacks.setIsBusy(false);
  }
};

interface UseAmountStepFormResult {
  grams: string;
  error: string | null;
  isBusy: boolean;
  setGrams: (value: string) => void;
  handlePhoto: (photo: File) => Promise<void>;
  handleSave: () => Promise<void>;
  changeMatch: () => void;
}

const useAmountStepForm = (
  mealId: string,
  product: SelectedProduct,
  alternatives: SelectedProduct[],
  dispatch: (action: WizardAction) => void,
  onSaved: () => void,
): UseAmountStepFormResult => {
  const [grams, setGrams] = useState("");
  const [source, setSource] = useState<"ai_estimated" | "manual">("manual");
  const [error, setError] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);

  const callbacks = { setError, setIsBusy };
  const setGramsManually = (value: string) => { setGrams(value); setSource("manual"); };
  const setGramsFromPhoto = (value: string) => { setGrams(value); setSource("ai_estimated"); };
  const handlePhoto = (photo: File) => estimateAmount(photo, setGramsFromPhoto, callbacks);
  const handleSave = () => saveAmount({ mealId, productId: product.id, grams, source }, dispatch, onSaved, callbacks);
  const changeMatch = () => dispatch({ type: "CHANGE_MATCH", nameGuess: product.name, candidates: [product, ...alternatives] });

  return { grams, error, isBusy, setGrams: setGramsManually, handlePhoto, handleSave, changeMatch };
};

export const AmountStep = ({ mealId, product, alternatives, dispatch, onSaved }: AmountStepProps) => {
  const form = useAmountStepForm(mealId, product, alternatives, dispatch, onSaved);

  return (
    <div className="flex flex-col gap-4">
      <AmountStepHeader
        productName={product.name}
        hasAlternatives={alternatives.length > 0}
        onChangeMatch={form.changeMatch}
      />
      <PhotoInput label="Amount photo (optional)" onSelect={form.handlePhoto} />
      <AmountField grams={form.grams} error={form.error} onGramsChange={form.setGrams} />
      <Button disabled={form.isBusy || form.grams.trim() === ""} onClick={form.handleSave}>
        Save ingredient
      </Button>
    </div>
  );
};
