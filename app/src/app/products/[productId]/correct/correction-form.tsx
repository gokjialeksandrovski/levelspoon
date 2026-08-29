// app/src/app/products/[productId]/correct/correction-form.tsx
"use client";

import Image from "next/image";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { updateProduct } from "@/actions/products";
import type { ProductForCorrection } from "@/actions/products";
import { validateNutrition } from "@/actions/ocr";
import {
  FIELD_LABELS,
  flaggedFieldSet,
  toFieldValues,
  toNutritionValues,
} from "@/lib/ocr/nutrition-fields";
import type { FieldValues } from "@/lib/ocr/nutrition-fields";
import type { NullableNutritionValues } from "@/lib/ocr/provider";

interface CorrectionFormProps {
  product: ProductForCorrection;
}

const toNullableNutritionValues = (values: ProductForCorrection["nutritionPer100g"]): NullableNutritionValues => values;

export const CorrectionForm = ({ product }: CorrectionFormProps) => {
  const router = useRouter();
  const [name, setName] = useState(product.name);
  const [photo, setPhoto] = useState<Blob | null>(null);
  const [values, setValues] = useState<FieldValues>(() =>
    toFieldValues(toNullableNutritionValues(product.nutritionPer100g)),
  );
  const [flags, setFlags] = useState<string[]>([]);
  const [validateError, setValidateError] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const revalidate = useCallback((currentValues: FieldValues) => {
    validateNutrition(toNutritionValues(currentValues))
      .then((result) => {
        setFlags(result.flags);
        setValidateError(false);
      })
      .catch(() => {
        setValidateError(true);
      });
  }, []);

  useEffect(() => {
    revalidate(toFieldValues(toNullableNutritionValues(product.nutritionPer100g)));
  }, [product, revalidate]);

  const flaggedFields = flaggedFieldSet(flags);
  const canSave = flaggedFields.size === 0 || validateError;

  const handleSave = async () => {
    setIsSaving(true);
    setSaveError(null);
    try {
      await updateProduct(product.id, {
        name,
        nutritionPer100g: toNutritionValues(values),
        ...(photo ? { photo } : {}),
      });
      router.back();
    } catch {
      setSaveError("Could not save this correction. Please try again.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <h1 className="text-xl font-semibold">Correct nutrition (per 100g)</h1>
      {product.photoUrl ? (
        <Image
          src={product.photoUrl}
          alt={`${product.name} nutrition label`}
          width={320}
          height={240}
          unoptimized
          className="rounded border object-contain"
        />
      ) : (
        <p className="text-sm text-gray-500">Photo unavailable</p>
      )}
      <div className="flex flex-col gap-1">
        <label htmlFor="photo" className="text-sm font-medium text-gray-700">
          Replace photo (optional)
        </label>
        <input
          id="photo"
          type="file"
          accept="image/*"
          onChange={(event) => setPhoto(event.target.files?.[0] ?? null)}
          className="text-sm"
        />
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor="name" className="text-sm font-medium text-gray-700">
          Product name
        </label>
        <input
          id="name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          className="rounded border border-gray-300 px-3 py-2"
        />
      </div>
      {(Object.keys(FIELD_LABELS) as (keyof FieldValues)[]).map((field) => (
        <div key={field} className="flex flex-col gap-1">
          <label htmlFor={field} className="text-sm font-medium text-gray-700">
            {FIELD_LABELS[field]}
          </label>
          <input
            id={field}
            type="number"
            value={values[field]}
            onChange={(event) => setValues({ ...values, [field]: event.target.value })}
            onBlur={() => revalidate(values)}
            className={`rounded border px-3 py-2 ${flaggedFields.has(field) ? "border-red-500" : "border-gray-300"}`}
          />
          {flaggedFields.has(field) && (
            <p className="text-sm text-red-600">This value looks off — please double-check it</p>
          )}
        </div>
      ))}
      {validateError && (
        <p className="text-sm text-yellow-700">Couldn&apos;t validate, please double-check the values before saving.</p>
      )}
      {saveError && <p className="text-sm text-red-600">{saveError}</p>}
      <button
        type="button"
        disabled={!canSave || isSaving}
        onClick={handleSave}
        className="rounded bg-blue-600 px-4 py-2 text-white disabled:opacity-50"
      >
        Save correction
      </button>
    </div>
  );
};
