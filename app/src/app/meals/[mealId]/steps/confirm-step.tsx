// app/src/app/meals/[mealId]/steps/confirm-step.tsx
"use client";

import { useState } from "react";

import { createProduct } from "@/actions/products";
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
    <div className="flex flex-col gap-3">
      <h2 className="font-medium">Confirm nutrition (per 100g)</h2>
      <div className="flex flex-col gap-1">
        <label htmlFor="name" className="text-sm font-medium text-gray-700">
          Product name
        </label>
        <input
          id="name"
          value={nameValue}
          onChange={(event) => setNameValue(event.target.value)}
          className="rounded border border-gray-300 px-3 py-2"
        />
      </div>
      {(Object.keys(FIELD_LABELS) as (keyof NullableNutritionValues)[]).map((field) => (
        <div key={field} className="flex flex-col gap-1">
          <label htmlFor={field} className="text-sm font-medium text-gray-700">
            {FIELD_LABELS[field]}
          </label>
          <input
            id={field}
            type="number"
            value={values[field]}
            onChange={(event) => setValues({ ...values, [field]: event.target.value })}
            className={`rounded border px-3 py-2 ${flaggedFields.has(field) ? "border-red-500" : "border-gray-300"}`}
          />
          {flaggedFields.has(field) && (
            <p className="text-sm text-red-600">Could not read this value — please enter it</p>
          )}
        </div>
      ))}
      {error && <p className="text-sm text-red-600">{error}</p>}
      <button
        type="button"
        disabled={!canSave || isSaving}
        onClick={handleSave}
        className="rounded bg-blue-600 px-4 py-2 text-white disabled:opacity-50"
      >
        Save product
      </button>
    </div>
  );
};
