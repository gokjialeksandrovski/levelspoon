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

export const ServingSizeStep = ({
  servingSizeText,
  perServing,
  name,
  photo,
  prefillGrams,
  dispatch,
}: ServingSizeStepProps) => {
  const [answer, setAnswer] = useState(() => (prefillGrams === null ? "" : formatPrefill(prefillGrams)));
  const [error, setError] = useState<string | null>(null);
  const [isResolving, setIsResolving] = useState(false);

  const handleSubmit = async () => {
    setError(null);
    setIsResolving(true);
    try {
      const read = await resolveServingSize(answer, servingSizeText, perServing, name);
      if (read.kind === "needs-serving-size") {
        setError(UNRESOLVED_ANSWER_ERROR);
        return;
      }
      dispatch({
        type: "NUTRITION_PARSED",
        parsed: read.values,
        flags: read.flags,
        name,
        photo,
        learned: read.learned,
      });
    } catch {
      setError(SAVE_ERROR);
    } finally {
      setIsResolving(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      {/* Showing the raw OCR text is deliberate: it tells the user what the
          machine saw, so a garbled read is obvious rather than mysterious. */}
      <h2 className="text-lg font-semibold">
        Serving size reads &ldquo;{servingSizeText}&rdquo;
      </h2>
      <p className="text-sm text-text-muted">What&rsquo;s one serving?</p>
      <Field
        label="Serving measurement"
        name="serving-measurement"
        value={answer}
        onChange={(event) => setAnswer(event.target.value)}
        helperText={
          prefillGrams === null
            ? "Accepts 52g, 1.8 oz, or 2 tbsp"
            : "Estimated from the package's net weight - accepts 52g, 1.8 oz, or 2 tbsp"
        }
      />
      <Button disabled={answer.trim() === "" || isResolving} onClick={handleSubmit}>
        Continue
      </Button>
      {error && <InlineMessage tone="error">{error}</InlineMessage>}
    </div>
  );
};
