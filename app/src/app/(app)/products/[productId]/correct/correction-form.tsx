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

// Mirrors confirm-step.tsx: on a blocked save, take focus straight to the
// first flagged input instead of leaving a keyboard or screen-reader user
// to find it after the alert (found via /accessibility, 2026-09-10).
const focusFirstFlagged = (flags: string[]): void => {
  const flaggedFields = flaggedFieldSet(flags);
  const first = (Object.keys(FIELD_LABELS) as (keyof FieldValues)[]).find((field) => flaggedFields.has(field));
  if (first) {
    document.getElementById(first)?.focus();
  }
};

// Guards two distinct failure shapes with the same fallback: no photoUrl at
// all (product has none), and a photoUrl that fails to actually load (a
// stale/expired presigned URL, a deleted object) - the latter previously had
// no handling and rendered a bare broken-image glyph instead of this message
// (confirmed live - a 404'd URL still resolves, then fires onError once the
// browser gives up loading it; found via /critique, 2026-09-10).
const StoredPhoto = ({ photoUrl, productName }: { photoUrl: string | null; productName: string }) => {
  const [failedToLoad, setFailedToLoad] = useState(false);

  if (!photoUrl || failedToLoad) {
    return <InlineMessage tone="warning">Photo unavailable</InlineMessage>;
  }

  return (
    <div className="overflow-hidden rounded-(--radius-surface) border border-border">
      <Image
        src={photoUrl}
        alt={`${productName} nutrition label`}
        width={320}
        height={240}
        unoptimized
        className="w-full object-contain"
        onError={() => setFailedToLoad(true)}
      />
    </div>
  );
};

const ReplacePhotoField = ({ onSelect }: { onSelect: (photo: Blob | null) => void }) => (
  <div className="flex flex-col gap-2">
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

// The meal-detail page a user lands back on is served from the client
// Router Cache; without a refresh it would show pre-correction values.
// Standalone (not nested inside the hook) so both this function's own body
// and useCorrectionForm's own body stay under the line budget.
const applyCorrection = async (
  product: ProductForCorrection,
  name: string,
  values: FieldValues,
  photo: Blob | null,
  router: ReturnType<typeof useRouter>,
): Promise<void> => {
  await updateProduct(product.id, { name, nutritionPer100g: toNutritionValues(values), ...(photo ? { photo } : {}) });
  router.refresh();
  router.back();
};

interface CorrectionSaveCallbacks {
  setIsSaving: (isSaving: boolean) => void;
  setSaveError: (error: string | null) => void;
  setFlags: (flags: string[]) => void;
}

const saveCorrection = async (product: ProductForCorrection, name: string, values: FieldValues, photo: Blob | null, router: ReturnType<typeof useRouter>, callbacks: CorrectionSaveCallbacks): Promise<void> => {
  callbacks.setIsSaving(true);
  callbacks.setSaveError(null);
  try {
    const freshFlags = await checkNutritionFlags(values);
    if (freshFlags.length > 0) {
      callbacks.setFlags(freshFlags);
      callbacks.setSaveError("Please fix the flagged values before saving.");
      focusFirstFlagged(freshFlags);
      return;
    }
    await applyCorrection(product, name, values, photo, router);
  } catch {
    callbacks.setSaveError("Could not save this correction. Please try again.");
  } finally {
    callbacks.setIsSaving(false);
  }
};

interface UseCorrectionFormResult {
  name: string;
  photo: Blob | null;
  values: FieldValues;
  validateError: boolean;
  saveError: string | null;
  isSaving: boolean;
  flaggedFields: Set<keyof FieldValues>;
  canSave: boolean;
  setName: (value: string) => void;
  setPhoto: (photo: Blob | null) => void;
  setFieldValue: (field: keyof FieldValues, value: string) => void;
  revalidateNow: () => void;
  handleSave: () => Promise<void>;
}

const useCorrectionForm = (product: ProductForCorrection): UseCorrectionFormResult => {
  const router = useRouter();
  const [name, setName] = useState(product.name);
  const [photo, setPhoto] = useState<Blob | null>(null);
  const [values, setValues] = useState<FieldValues>(() => toFieldValues(toNullableNutritionValues(product.nutritionPer100g)));
  const [flags, setFlags] = useState<string[]>([]);
  const [validateError, setValidateError] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const revalidate = useCallback((currentValues: FieldValues) => {
    validateNutrition(toNutritionValues(currentValues)).then((result) => { setFlags(result.flags); setValidateError(false); }).catch(() => setValidateError(true));
  }, []);

  useEffect(() => { revalidate(toFieldValues(toNullableNutritionValues(product.nutritionPer100g))); }, [product, revalidate]);

  const flaggedFields = flaggedFieldSet(flags);
  const canSave = flaggedFields.size === 0 || validateError;
  const setFieldValue = (field: keyof FieldValues, value: string) => setValues({ ...values, [field]: value });
  const revalidateNow = () => revalidate(values);
  const handleSave = () => saveCorrection(product, name, values, photo, router, { setIsSaving, setSaveError, setFlags });

  return { name, photo, values, validateError, saveError, isSaving, flaggedFields, canSave, setName, setPhoto, setFieldValue, revalidateNow, handleSave };
};

interface CorrectionFormBodyProps {
  product: ProductForCorrection;
  form: UseCorrectionFormResult;
}

const CorrectionFormBody = ({ product, form }: CorrectionFormBodyProps) => (
  <div className="flex flex-col gap-4">
    <h2 className="text-xl font-semibold">Correct nutrition (per 100g)</h2>
    <StoredPhoto photoUrl={product.photoUrl} productName={product.name} />
    <ReplacePhotoField onSelect={form.setPhoto} />
    <Field label="Product name" name="name" value={form.name} onChange={(event) => form.setName(event.target.value)} />
    <NutritionFields
      values={form.values}
      flaggedFields={form.flaggedFields}
      onFieldChange={form.setFieldValue}
      onFieldBlur={form.revalidateNow}
    />
    <CorrectionFeedback saveError={form.saveError} validateError={form.validateError} />
    <Button disabled={!form.canSave} pending={form.isSaving} onClick={form.handleSave}>
      Save correction
    </Button>
  </div>
);

export const CorrectionForm = ({ product }: CorrectionFormProps) => {
  const router = useRouter();
  const form = useCorrectionForm(product);

  return (
    <>
      <AppHeader variant="back" title="Correct product" onBack={() => router.back()} />
      <main id="main-content" tabIndex={-1} className="flex-1 px-4 py-6 focus:outline-none">
        <CorrectionFormBody product={product} form={form} />
      </main>
    </>
  );
};
