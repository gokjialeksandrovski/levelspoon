// app/src/app/meals/[mealId]/steps/confirm-step.tsx
"use client";

import { useState } from "react";

import { createProduct } from "@/actions/products";
import type { NutritionValues } from "@/actions/products";
import type { NullableNutritionValues } from "@/lib/ocr/provider";

import type { WizardAction } from "../capture-wizard.types";

interface ConfirmStepProps {
  name: string;
  parsed: NullableNutritionValues;
  flags: string[];
  photo: Blob;
  dispatch: (action: WizardAction) => void;
}

const FIELD_LABELS: Record<keyof NullableNutritionValues, string> = {
  energyKcal: "Energy (kcal)",
  fatG: "Fat (g)",
  saturatesG: "Saturates (g)",
  carbohydrateG: "Carbohydrate (g)",
  sugarsG: "Sugars (g)",
  proteinG: "Protein (g)",
  saltG: "Salt (g)",
};

// Matches ocr-service's validate.py flag naming (snake_case field names),
// confirmed directly against its source during planning.
const FLAG_TO_FIELD: Record<string, keyof NullableNutritionValues> = {
  energy_kcal: "energyKcal",
  fat_g: "fatG",
  saturates_g: "saturatesG",
  carbohydrate_g: "carbohydrateG",
  sugars_g: "sugarsG",
  protein_g: "proteinG",
  salt_g: "saltG",
};

type FieldValues = Record<keyof NullableNutritionValues, string>;

const toFieldValues = (parsed: NullableNutritionValues): FieldValues => {
  const entries = Object.entries(parsed) as [keyof NullableNutritionValues, number | null][];
  const stringEntries = entries.map(([key, value]) => [key, value === null ? "" : String(value)] as const);
  return Object.fromEntries(stringEntries) as FieldValues;
};

const toNutritionValues = (values: FieldValues): NutritionValues => ({
  energyKcal: Number(values.energyKcal),
  fatG: Number(values.fatG),
  saturatesG: Number(values.saturatesG),
  carbohydrateG: Number(values.carbohydrateG),
  sugarsG: Number(values.sugarsG),
  proteinG: Number(values.proteinG),
  saltG: Number(values.saltG),
});

const flaggedFieldSet = (flags: string[]): Set<keyof NullableNutritionValues> =>
  new Set(
    flags
      .map((flag) => FLAG_TO_FIELD[flag])
      .filter((field): field is keyof NullableNutritionValues => Boolean(field)),
  );

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
