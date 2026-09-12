"use client";

import { useCallback, useState } from "react";

import { validateNutrition } from "@/actions/ocr";
import { createProduct } from "@/actions/products";
import { Button } from "@/components/button";
import { Field } from "@/components/field";
import { InlineMessage } from "@/components/inline-message";
import {
  FIELD_LABELS,
  flaggedFieldSet,
  focusFirstFlagged,
  toFieldValues,
  toNutritionValues,
} from "@/lib/ocr/nutrition-fields";
import type { FieldValues } from "@/lib/ocr/nutrition-fields";
import type { LearnedMeasures } from "@/lib/measures/learn";
import type { NullableNutritionValues } from "@/lib/ocr/provider";

import type { WizardAction } from "../capture-wizard.types";

interface ConfirmStepProps {
  name: string;
  parsed: NullableNutritionValues;
  flags: string[];
  photo: Blob;
  learned: LearnedMeasures;
  nutritionBasisUnit: string;
  nutritionBasisQuantity: number;
  dispatch: (action: WizardAction) => void;
}

const UNREADABLE_FIELD_ERROR = "Could not read this value - please enter it";
// Matches correction-form.tsx's wording for the same situation: a value the
// OCR did read, just not one that passes a cross-field plausibility rule
// (e.g. saturates can't exceed fat). "Could not read" would be false here -
// the field with the genuinely wrong number and the field only implicated
// by its relationship to it both need a look, but they aren't the same
// problem and shouldn't say they are.
const INCONSISTENT_FIELD_ERROR = "This value looks off - please double-check it";
const SAVE_BLOCKED_ERROR = "Please fix the flagged values before saving.";

const errorFor = (field: keyof FieldValues, flaggedFields: Set<keyof FieldValues>, values: FieldValues): string | undefined => {
  if (!flaggedFields.has(field)) {
    return undefined;
  }
  return values[field].trim() === "" ? UNREADABLE_FIELD_ERROR : INCONSISTENT_FIELD_ERROR;
};

// Re-checks the whole row on blur and again right before saving, rather
// than trusting the flags the OCR call first returned: a field can be
// flagged purely because of its RELATIONSHIP to another (saturates can't
// exceed fat), so fixing saturates must also clear fat's now-stale
// warning, and a click on Save before a blur fires must not let a still-
// flagged value slip through with the mount-time flags. Mirrors
// correction-form.tsx's already-proven pattern for the same problem.
const checkNutritionFlags = async (currentValues: FieldValues): Promise<string[]> => {
  const result = await validateNutrition(toNutritionValues(currentValues));
  return result.flags;
};

const saveProduct = async (
  nameValue: string,
  values: FieldValues,
  photo: Blob,
  learned: LearnedMeasures,
  nutritionBasisUnit: string,
  nutritionBasisQuantity: number,
  dispatch: (action: WizardAction) => void,
): Promise<void> => {
  const { productId } = await createProduct({
    name: nameValue,
    nutritionPer100g: toNutritionValues(values),
    photo,
    learned,
    nutritionBasisUnit,
    nutritionBasisQuantity,
  });
  dispatch({
    type: "PRODUCT_CREATED",
    product: {
      id: productId,
      name: nameValue,
      densityGMl: learned.densityGMl,
      servingUnit: learned.servingUnit,
      servingGrams: learned.servingGrams,
      nutritionBasisUnit,
    },
  });
};

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
        value={values[field]}
        onChange={(event) => onFieldChange(field, event.target.value)}
        onBlur={onFieldBlur}
        flagged={flaggedFields.has(field)}
        error={errorFor(field, flaggedFields, values)}
      />
    ))}
  </>
);

interface SaveConfirmInput {
  nameValue: string;
  values: FieldValues;
  photo: Blob;
  learned: LearnedMeasures;
  nutritionBasisUnit: string;
  nutritionBasisQuantity: number;
}

interface ConfirmSaveCallbacks {
  setFlags: (flags: string[]) => void;
  setError: (error: string | null) => void;
  setIsSaving: (isSaving: boolean) => void;
}

// Standalone (not a hook) so useConfirmStepForm's own body stays under the
// line budget - takes a bundled callbacks object rather than closing over
// the hook's state, mirroring this pass's other DI'd handlers (e.g.
// ingredient-row.tsx's existing shape, amount-step.tsx's estimateAmount).
const saveConfirmedProduct = async (input: SaveConfirmInput, dispatch: (action: WizardAction) => void, callbacks: ConfirmSaveCallbacks): Promise<void> => {
  callbacks.setError(null);
  callbacks.setIsSaving(true);
  try {
    const freshFlags = await checkNutritionFlags(input.values);
    if (freshFlags.length > 0) {
      callbacks.setFlags(freshFlags);
      callbacks.setError(SAVE_BLOCKED_ERROR);
      focusFirstFlagged(freshFlags);
      return;
    }
    await saveProduct(input.nameValue, input.values, input.photo, input.learned, input.nutritionBasisUnit, input.nutritionBasisQuantity, dispatch);
  } catch {
    callbacks.setError("Could not save this product. Please try again.");
  } finally {
    callbacks.setIsSaving(false);
  }
};

interface UseConfirmStepFormResult {
  nameValue: string;
  values: FieldValues;
  error: string | null;
  isSaving: boolean;
  flaggedFields: Set<keyof FieldValues>;
  canSave: boolean;
  setNameValue: (value: string) => void;
  setFieldValue: (field: keyof FieldValues, value: string) => void;
  revalidateNow: () => void;
  handleSave: () => Promise<void>;
}

const useConfirmStepForm = (
  name: string,
  parsed: NullableNutritionValues,
  initialFlags: string[],
  photo: Blob,
  learned: LearnedMeasures,
  nutritionBasisUnit: string,
  nutritionBasisQuantity: number,
  dispatch: (action: WizardAction) => void,
): UseConfirmStepFormResult => {
  const [nameValue, setNameValue] = useState(name);
  const [values, setValues] = useState(() => toFieldValues(parsed));
  const [flags, setFlags] = useState(initialFlags);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const revalidate = useCallback((currentValues: FieldValues) => {
    checkNutritionFlags(currentValues)
      .then(setFlags)
      // A transient failure here just leaves the existing flags in place -
      // revalidation is a convenience, not something that should block the
      // user, and handleSave's own pre-save check still guards the save.
      .catch(() => {});
  }, []);

  const flaggedFields = flaggedFieldSet(flags);
  const canSave = [...flaggedFields].every((field) => values[field].trim() !== "");
  const setFieldValue = (field: keyof FieldValues, value: string) => setValues({ ...values, [field]: value });
  const revalidateNow = () => revalidate(values);
  const handleSave = () => saveConfirmedProduct({ nameValue, values, photo, learned, nutritionBasisUnit, nutritionBasisQuantity }, dispatch, { setFlags, setError, setIsSaving });

  return { nameValue, values, error, isSaving, flaggedFields, canSave, setNameValue, setFieldValue, revalidateNow, handleSave };
};

interface ProductNameFieldProps {
  value: string;
  onChange: (value: string) => void;
}

const ProductNameField = ({ value, onChange }: ProductNameFieldProps) => (
  <Field label="Product name" name="name" value={value} onChange={(event) => onChange(event.target.value)} />
);

export const ConfirmStep = ({ name, parsed, flags: initialFlags, photo, learned, nutritionBasisUnit, nutritionBasisQuantity, dispatch }: ConfirmStepProps) => {
  const form = useConfirmStepForm(name, parsed, initialFlags, photo, learned, nutritionBasisUnit, nutritionBasisQuantity, dispatch);

  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-lg font-semibold">Confirm nutrition (per {nutritionBasisQuantity} {nutritionBasisUnit})</h2>
      <ProductNameField value={form.nameValue} onChange={form.setNameValue} />
      <NutritionFields
        values={form.values}
        flaggedFields={form.flaggedFields}
        onFieldChange={form.setFieldValue}
        onFieldBlur={form.revalidateNow}
      />
      {form.error && <InlineMessage tone="error">{form.error}</InlineMessage>}
      <Button disabled={!form.canSave} pending={form.isSaving} onClick={form.handleSave}>
        Save product
      </Button>
    </div>
  );
};
