"use client";

import { useState } from "react";

import { resolveServingSize } from "@/features/products/actions/ocr";
import type { NutritionValues } from "@/types/nutrition";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { InlineMessage } from "@/components/ui/inline-message";

import type { WizardAction } from "../capture-wizard.types";

interface ServingSizeStepProps {
  servingSizeText: string;
  perServing: NutritionValues;
  name: string;
  photo: Blob;
  prefillGrams: number | null;
  unitName: string | null;
  pendingBarcode: string | null;
  dispatch: (action: WizardAction) => void;
}

const UNPARSEABLE_ANSWER_ERROR =
  "Couldn't read that as a measurement. Try a weight like 52g or 1.8 oz, or a measure like 2 tbsp.";
const SAVE_ERROR = "Could not work out the serving size. Please try again.";
const PREFILL_DECIMALS = 2;

// unitName is non-null when resolveGrams recognised the unit but has no
// density/learned weight to convert it - a different problem than unparseable
// text, so ask for a weight instead of telling the user to retype it.
const measurementSuggestion = (unitName: string | null): string =>
  unitName === null
    ? "Accepts 52g, 1.8 oz, or 2 tbsp"
    : `We don't know this product's weight for "${unitName}" yet - enter a weight instead, like 52g or 1.8 oz`;

const measurementHelpText = (unitName: string | null, hasPrefill: boolean): string =>
  hasPrefill
    ? `Estimated from the package's net weight - ${measurementSuggestion(unitName)}`
    : measurementSuggestion(unitName);

const unresolvedAnswerError = (unitName: string | null): string =>
  unitName === null ? UNPARSEABLE_ANSWER_ERROR : measurementSuggestion(unitName);

// Trailing zeros are stripped by round-tripping through Number, matching
// nutrition-fields.ts's own display-rounding convention - "50g", not
// "50.00g".
const formatPrefill = (grams: number): string => `${Number(grams.toFixed(PREFILL_DECIMALS))}g`;

interface UseServingSizeStepResult {
  answer: string;
  error: string | null;
  isResolving: boolean;
  setAnswer: (value: string) => void;
  handleSubmit: () => Promise<void>;
}

const useServingSizeStep = (
  servingSizeText: string,
  perServing: NutritionValues,
  name: string,
  photo: Blob,
  prefillGrams: number | null,
  pendingBarcode: string | null,
  dispatch: (action: WizardAction) => void,
): UseServingSizeStepResult => {
  const [answer, setAnswer] = useState(() => (prefillGrams === null ? "" : formatPrefill(prefillGrams)));
  const [error, setError] = useState<string | null>(null);
  const [isResolving, setIsResolving] = useState(false);

  const handleSubmit = async (): Promise<void> => {
    setError(null);
    setIsResolving(true);
    try {
      const read = await resolveServingSize(answer, servingSizeText, perServing, name);
      if (read.kind === "needs-serving-size") {
        setError(unresolvedAnswerError(read.unitName));
        return;
      }
      dispatch({ type: "NUTRITION_PARSED", parsed: read.values, flags: read.flags, name, photo, learned: read.learned, nutritionBasisUnit: read.nutritionBasisUnit, nutritionBasisQuantity: read.nutritionBasisQuantity, pendingBarcode });
    } catch {
      setError(SAVE_ERROR);
    } finally {
      setIsResolving(false);
    }
  };

  return { answer, error, isResolving, setAnswer, handleSubmit };
};

interface ServingMeasurementFieldProps {
  answer: string;
  prefillGrams: number | null;
  unitName: string | null;
  onChange: (value: string) => void;
}

const ServingMeasurementField = ({ answer, prefillGrams, unitName, onChange }: ServingMeasurementFieldProps) => (
  <Field
    label="Serving measurement"
    name="serving-measurement"
    value={answer}
    onChange={(event) => onChange(event.target.value)}
    helperText={measurementHelpText(unitName, prefillGrams !== null)}
  />
);

export const ServingSizeStep = ({ servingSizeText, perServing, name, photo, prefillGrams, unitName, pendingBarcode, dispatch }: ServingSizeStepProps) => {
  const form = useServingSizeStep(servingSizeText, perServing, name, photo, prefillGrams, pendingBarcode, dispatch);

  return (
    <div className="flex flex-col gap-4">
      {/* Showing the raw OCR text is deliberate: it tells the user what the
          machine saw, so a garbled read is obvious rather than mysterious. */}
      <h2 className="text-lg font-semibold">
        Serving size reads &ldquo;{servingSizeText}&rdquo;
      </h2>
      <p className="text-sm text-text-muted">What&rsquo;s one serving?</p>
      <ServingMeasurementField answer={form.answer} prefillGrams={prefillGrams} unitName={unitName} onChange={form.setAnswer} />
      <Button disabled={form.answer.trim() === ""} pending={form.isResolving} onClick={form.handleSubmit}>
        Continue
      </Button>
      {form.error && <InlineMessage tone="error">{form.error}</InlineMessage>}
    </div>
  );
};
