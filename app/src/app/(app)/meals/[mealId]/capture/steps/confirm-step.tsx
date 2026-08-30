// app/src/app/meals/[mealId]/steps/confirm-step.tsx
"use client";

import { useState } from "react";

import { createProduct } from "@/actions/products";
import { Button } from "@/components/button";
import { Field } from "@/components/field";
import { InlineMessage } from "@/components/inline-message";
import {
  FIELD_LABELS,
  flaggedFieldSet,
  toFieldValues,
  toNutritionValues,
} from "@/lib/ocr/nutrition-fields";
import type { NullableNutritionValues } from "@/lib/ocr/provider";

import type { WizardAction } from "../capture-wizard.types";

interface ConfirmStepProps {
  name: string;
  parsed: NullableNutritionValues;
  flags: string[];
  photo: Blob;
  dispatch: (action: WizardAction) => void;
}

const FLAGGED_FIELD_ERROR = "Could not read this value - please enter it";

export const ConfirmStep = ({ name, parsed, flags, photo, dispatch }: ConfirmStepProps) => {
  const [nameValue, setNameValue] = useState(name);
  const [values, setValues] = useState(() => toFieldValues(parsed));
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const flaggedFields = flaggedFieldSet(flags);
  const canSave = [...flaggedFields].every((field) => values[field].trim() !== "");

  const handleSave = async () => {
    setError(null);
    setIsSaving(true);
    try {
      const { productId } = await createProduct({
        name: nameValue,
        nutritionPer100g: toNutritionValues(values),
        photo,
      });
      dispatch({ type: "PRODUCT_CREATED", product: { id: productId, name: nameValue } });
    } catch {
      setError("Could not save this product. Please try again.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-lg font-semibold">Confirm nutrition (per 100g)</h2>
      <Field
        label="Product name"
        name="name"
        value={nameValue}
        onChange={(event) => setNameValue(event.target.value)}
      />
      {(Object.keys(FIELD_LABELS) as (keyof NullableNutritionValues)[]).map((field) => (
        <Field
          key={field}
          label={FIELD_LABELS[field]}
          name={field}
          type="number"
          value={values[field]}
          onChange={(event) => setValues({ ...values, [field]: event.target.value })}
          flagged={flaggedFields.has(field)}
          error={flaggedFields.has(field) ? FLAGGED_FIELD_ERROR : undefined}
        />
      ))}
      {error && <InlineMessage tone="error">{error}</InlineMessage>}
      <Button disabled={!canSave || isSaving} onClick={handleSave}>
        Save product
      </Button>
    </div>
  );
};
