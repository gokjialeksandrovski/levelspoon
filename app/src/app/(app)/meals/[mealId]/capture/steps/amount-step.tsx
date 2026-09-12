"use client";

import { useState } from "react";

import { saveMealIngredient } from "@/actions/meals";
import { estimateQuantity } from "@/actions/quantity";
import { Button } from "@/components/button";
import { InlineMessage } from "@/components/inline-message";
import { TEXT_LINK_SM } from "@/components/tap-target";
import { UnitAmountField } from "@/components/unit-amount-field";
import { triggerLogSuccessHaptic } from "@/lib/haptics/log-success";
import { availableUnits, defaultUnit } from "@/lib/measures/available-units";
import type { MeasureContext } from "@/lib/measures/resolve-grams";
import { resolveQuantity } from "@/lib/measures/resolve-quantity";

import type { SelectedProduct, WizardAction } from "../capture-wizard.types";

import { AmountPhotoField } from "./amount-photo-field";

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
      <button type="button" onClick={onChangeMatch} className={TEXT_LINK_SM}>
        <span>Change?</span>
      </button>
    )}
  </div>
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
  quantity: number;
  quantityUnit: string;
  source: "ai_estimated" | "manual";
}

// Exported (was previously module-private) so amount-step.test.ts can call
// it directly, same posture as this file's existing estimateAmount.
export const saveAmount = async (input: SaveAmountInput, dispatch: (action: WizardAction) => void, onSaved: () => void, callbacks: AmountStepCallbacks): Promise<void> => {
  callbacks.setError(null);
  callbacks.setIsBusy(true);
  try {
    await saveMealIngredient({
      mealId: input.mealId,
      productId: input.productId,
      quantity: input.quantity,
      quantityUnit: input.quantityUnit,
      quantitySource: input.source,
    });
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

interface ResolveAndSaveInput {
  mealId: string;
  productId: string;
  count: string;
  unit: string;
  context: MeasureContext;
  source: "ai_estimated" | "manual";
}

// Splits the "turn a typed count+unit into a savable quantity" step out of
// saveAmount (which only ever deals in an already-resolved quantity+unit)
// rather than folding resolveQuantity's call into the hook below - same
// reasoning as estimateAmount: an async, independently testable, DI'd unit
// of work.
export const resolveAndSaveAmount = async (
  input: ResolveAndSaveInput,
  dispatch: (action: WizardAction) => void,
  onSaved: () => void,
  callbacks: AmountStepCallbacks,
): Promise<void> => {
  const resolution = resolveQuantity(input.count, input.unit, input.context);
  if (resolution.kind === "unresolved") {
    callbacks.setError(`Could not work out the amount in "${input.unit}" - try a different unit.`);
    return;
  }
  await saveAmount(
    { mealId: input.mealId, productId: input.productId, quantity: resolution.quantity, quantityUnit: resolution.quantityUnit, source: input.source },
    dispatch,
    onSaved,
    callbacks,
  );
};

const contextFor = (product: SelectedProduct): MeasureContext => ({
  productName: product.name,
  densityGMl: product.densityGMl,
  servingUnit: product.servingUnit,
  servingGrams: product.servingGrams,
  nutritionBasisUnit: product.nutritionBasisUnit,
});

interface UseAmountStepFormResult {
  count: string;
  unit: string;
  units: string[];
  error: string | null;
  isBusy: boolean;
  setCount: (value: string) => void;
  setUnit: (value: string) => void;
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
  const context = contextFor(product);
  const units = availableUnits(context);
  const [count, setCount] = useState("");
  const [unit, setUnit] = useState(defaultUnit(context));
  const [source, setSource] = useState<"ai_estimated" | "manual">("manual");
  const [error, setError] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);

  const callbacks = { setError, setIsBusy };
  const setCountManually = (value: string) => { setCount(value); setSource("manual"); };
  const setUnitManually = (value: string) => { setUnit(value); setSource("manual"); };
  const setCountFromPhoto = (value: string) => { setCount(value); setUnit("g"); setSource("ai_estimated"); };
  const handlePhoto = (photo: File) => estimateAmount(photo, setCountFromPhoto, callbacks);
  const handleSave = () => resolveAndSaveAmount({ mealId, productId: product.id, count, unit, context, source }, dispatch, onSaved, callbacks);
  const changeMatch = () => dispatch({ type: "CHANGE_MATCH", nameGuess: product.name, candidates: [product, ...alternatives] });

  return { count, unit, units, error, isBusy, setCount: setCountManually, setUnit: setUnitManually, handlePhoto, handleSave, changeMatch };
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
      <AmountPhotoField onSelect={form.handlePhoto} />
      <UnitAmountField
        name="grams"
        count={form.count}
        unit={form.unit}
        units={form.units}
        onCountChange={form.setCount}
        onUnitChange={form.setUnit}
      />
      {form.error && <InlineMessage tone="error">{form.error}</InlineMessage>}
      <Button disabled={form.count.trim() === ""} pending={form.isBusy} onClick={form.handleSave}>
        Save ingredient
      </Button>
    </div>
  );
};
