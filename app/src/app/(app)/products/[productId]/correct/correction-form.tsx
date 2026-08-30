// app/src/app/(app)/products/[productId]/correct/correction-form.tsx
"use client";

import Image from "next/image";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { updateProduct } from "@/actions/products";
import type { ProductForCorrection } from "@/actions/products";
import { validateNutrition } from "@/actions/ocr";
import { AppHeader } from "@/components/app-header";
import { Button } from "@/components/button";
import { Field } from "@/components/field";
import { InlineMessage } from "@/components/inline-message";
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

const FLAGGED_ERROR = "This value looks off - please double-check it";

const toNullableNutritionValues = (values: ProductForCorrection["nutritionPer100g"]): NullableNutritionValues => values;

// Re-checks validation right before a save rather than trusting the last
// onBlur's `flags` state: a user can click Save while a field is still
// focused (before its blur fires and revalidate resolves), which would
// otherwise let a flagged value through with stale, empty `flags`.
const checkNutritionFlags = async (currentValues: FieldValues): Promise<string[]> => {
  const result = await validateNutrition(toNutritionValues(currentValues));
  return result.flags;
};

const StoredPhoto = ({ photoUrl, productName }: { photoUrl: string | null; productName: string }) =>
  photoUrl ? (
    <div className="overflow-hidden rounded-(--radius-surface) border border-border">
      <Image
        src={photoUrl}
        alt={`${productName} nutrition label`}
        width={320}
        height={240}
        unoptimized
        className="w-full object-contain"
      />
    </div>
  ) : (
    <InlineMessage tone="warning">Photo unavailable</InlineMessage>
  );

const ReplacePhotoField = ({ onSelect }: { onSelect: (photo: Blob | null) => void }) => (
  <div className="flex flex-col gap-1.5">
    <label htmlFor="photo" className="text-xs font-medium text-text-muted">
      Replace photo (optional)
    </label>
    <input
      id="photo"
      type="file"
      accept="image/*"
      onChange={(event) => onSelect(event.target.files?.[0] ?? null)}
      className="text-sm text-text-muted file:mr-3 file:rounded-(--radius-control) file:border-0 file:bg-surface-raised file:px-3 file:py-2 file:text-sm file:text-text"
    />
  </div>
);

interface NutritionFieldsProps {
  values: FieldValues;
  flaggedFields: Set<keyof FieldValues>;
  onFieldChange: (field: keyof FieldValues, value: string) => void;
  onFieldBlur: () => void;
}

const NutritionFields = ({ values, flaggedFields, onFieldChange, onFieldBlur }: NutritionFieldsProps) => (
  <>
    {(Object.keys(FIELD_LABELS) as (keyof FieldValues)[]).map((field) => (
      <Field
        key={field}
        label={FIELD_LABELS[field]}
        name={field}
        type="number"
        inputMode="decimal"
        value={values[field]}
        onChange={(event) => onFieldChange(field, event.target.value)}
        onBlur={onFieldBlur}
        flagged={flaggedFields.has(field)}
        error={flaggedFields.has(field) ? FLAGGED_ERROR : undefined}
      />
    ))}
  </>
);

interface CorrectionFeedbackProps {
  saveError: string | null;
  validateError: boolean;
}

const CorrectionFeedback = ({ saveError, validateError }: CorrectionFeedbackProps) => (
  <>
    {validateError && (
      <InlineMessage tone="warning">
        Couldn&apos;t validate, please double-check the values before saving.
      </InlineMessage>
    )}
    {saveError && <InlineMessage tone="error">{saveError}</InlineMessage>}
  </>
);

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

  // The meal-detail page a user lands back on is served from the client
  // Router Cache; without a refresh it would show pre-correction values.
  const applyCorrection = async (): Promise<void> => {
    await updateProduct(product.id, {
      name,
      nutritionPer100g: toNutritionValues(values),
      ...(photo ? { photo } : {}),
    });
    router.refresh();
    router.back();
  };

  const handleSave = async () => {
    setIsSaving(true);
    setSaveError(null);
    try {
      const freshFlags = await checkNutritionFlags(values);
      if (freshFlags.length > 0) {
        setFlags(freshFlags);
        setSaveError("Please fix the flagged values before saving.");
        return;
      }
      await applyCorrection();
    } catch {
      setSaveError("Could not save this correction. Please try again.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <>
      <AppHeader variant="back" title="Correct product" onBack={() => router.back()} />
      <main className="flex-1 px-4 py-6">
        <div className="flex flex-col gap-4">
          <h2 className="text-xl font-semibold">Correct nutrition (per 100g)</h2>
          <StoredPhoto photoUrl={product.photoUrl} productName={product.name} />
          <ReplacePhotoField onSelect={setPhoto} />
          <Field label="Product name" name="name" value={name} onChange={(event) => setName(event.target.value)} />
          <NutritionFields
            values={values}
            flaggedFields={flaggedFields}
            onFieldChange={(field, value) => setValues({ ...values, [field]: value })}
            onFieldBlur={() => revalidate(values)}
          />
          <CorrectionFeedback saveError={saveError} validateError={validateError} />
          <Button disabled={!canSave || isSaving} onClick={handleSave}>
            Save correction
          </Button>
        </div>
      </main>
    </>
  );
};
