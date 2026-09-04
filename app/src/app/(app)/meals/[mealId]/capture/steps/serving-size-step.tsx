// app/src/app/(app)/meals/[mealId]/capture/steps/serving-size-step.tsx
"use client";

import { useState } from "react";

import { resolveServingSize } from "@/actions/ocr";
import type { NutritionValues } from "@/actions/products";
import { Button } from "@/components/button";
import { Field } from "@/components/field";
import { InlineMessage } from "@/components/inline-message";

import type { WizardAction } from "../capture-wizard.types";

interface ServingSizeStepProps {
  servingSizeText: string;
  perServing: NutritionValues;
  name: string;
  photo: Blob;
  prefillGrams: number | null;
  dispatch: (action: WizardAction) => void;
}

const UNRESOLVED_ANSWER_ERROR =
  "Couldn't read that as a measurement. Try a weight like 52g or 1.8 oz, or a measure like 2 tbsp.";
const SAVE_ERROR = "Could not work out the serving size. Please try again.";
const PREFILL_DECIMALS = 2;

// Trailing zeros are stripped by round-tripping through Number, matching
// nutrition-fields.ts's own display-rounding convention - "50g", not
// "50.00g".
const formatPrefill = (grams: number): string => `${Number(grams.toFixed(PREFILL_DECIMALS))}g`;

interface ServingSizeCallbacks {
  onError: (error: string | null) => void;
  onResolvingChange: (isResolving: boolean) => void;
  dispatch: (action: WizardAction) => void;
}

// Standalone (not nested inside the hook) so both this function's own body
// and useServingSizeStep's own body stay under the line budget - this was
// previously a 23-line closure nested inside the component, which ESLint
// flags independently of its container's own size.
const submitServingSizeAnswer = async (answer: string, servingSizeText: string, perServing: NutritionValues, name: string, photo: Blob, callbacks: ServingSizeCallbacks): Promise<void> => {
  callbacks.onError(null);
  callbacks.onResolvingChange(true);
  try {
    const read = await resolveServingSize(answer, servingSizeText, perServing, name);
    if (read.kind === "needs-serving-size") {
      callbacks.onError(UNRESOLVED_ANSWER_ERROR);
      return;
    }
    callbacks.dispatch({ type: "NUTRITION_PARSED", parsed: read.values, flags: read.flags, name, photo, learned: read.learned });
  } catch {
    callbacks.onError(SAVE_ERROR);
  } finally {
    callbacks.onResolvingChange(false);
  }
};

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
  dispatch: (action: WizardAction) => void,
): UseServingSizeStepResult => {
  const [answer, setAnswer] = useState(() => (prefillGrams === null ? "" : formatPrefill(prefillGrams)));
  const [error, setError] = useState<string | null>(null);
  const [isResolving, setIsResolving] = useState(false);

  const callbacks: ServingSizeCallbacks = { onError: setError, onResolvingChange: setIsResolving, dispatch };
  const handleSubmit = () => submitServingSizeAnswer(answer, servingSizeText, perServing, name, photo, callbacks);

  return { answer, error, isResolving, setAnswer, handleSubmit };
};

interface ServingMeasurementFieldProps {
  answer: string;
  prefillGrams: number | null;
  onChange: (value: string) => void;
}

const ServingMeasurementField = ({ answer, prefillGrams, onChange }: ServingMeasurementFieldProps) => (
  <Field
    label="Serving measurement"
    name="serving-measurement"
    value={answer}
    onChange={(event) => onChange(event.target.value)}
    helperText={
      prefillGrams === null
        ? "Accepts 52g, 1.8 oz, or 2 tbsp"
        : "Estimated from the package's net weight - accepts 52g, 1.8 oz, or 2 tbsp"
    }
  />
);

export const ServingSizeStep = ({ servingSizeText, perServing, name, photo, prefillGrams, dispatch }: ServingSizeStepProps) => {
  const form = useServingSizeStep(servingSizeText, perServing, name, photo, prefillGrams, dispatch);

  return (
    <div className="flex flex-col gap-4">
      {/* Showing the raw OCR text is deliberate: it tells the user what the
          machine saw, so a garbled read is obvious rather than mysterious. */}
      <h2 className="text-lg font-semibold">
        Serving size reads &ldquo;{servingSizeText}&rdquo;
      </h2>
      <p className="text-sm text-text-muted">What&rsquo;s one serving?</p>
      <ServingMeasurementField answer={form.answer} prefillGrams={prefillGrams} onChange={form.setAnswer} />
      <Button disabled={form.answer.trim() === "" || form.isResolving} onClick={form.handleSubmit}>
        Continue
      </Button>
      {form.error && <InlineMessage tone="error">{form.error}</InlineMessage>}
    </div>
  );
};
