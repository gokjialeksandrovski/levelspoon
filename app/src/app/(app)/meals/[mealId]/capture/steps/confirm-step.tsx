"use client";

import { useCallback, useState } from "react";

import { validateNutrition } from "@/features/products/actions/ocr";
import { createProduct } from "@/features/products/actions/products";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { InlineMessage } from "@/components/ui/inline-message";
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
// A value OCR did read, just failing a cross-field plausibility rule (e.g.
// saturates > fat) - "Could not read" would be false here.
const INCONSISTENT_FIELD_ERROR = "This value looks off - please double-check it";
const SAVE_BLOCKED_ERROR = "Please fix the flagged values before saving.";

const errorFor = (field: keyof FieldValues, flaggedFields: Set<keyof FieldValues>, values: FieldValues): string | undefined => {
  if (!flaggedFields.has(field)) {
    return undefined;
  }
  return values[field].trim() === "" ? UNREADABLE_FIELD_ERROR : INCONSISTENT_FIELD_ERROR;
};

// Re-checks on blur and again before saving, not just the OCR call's initial
// flags: a field can be flagged only via its relationship to another, so
// fixing one must clear the other's now-stale warning.
const checkNutritionFlags = async (currentValues: FieldValues): Promise<string[]> => {
  const result = await validateNutrition(toNutritionValues(currentValues));
  return result.flags;
};

const saveProduct = async (input: SaveConfirmInput, dispatch: (action: WizardAction) => void): Promise<void> => {
  const { productId } = await createProduct({
    name: input.nameValue,
    nutritionPer100g: toNutritionValues(input.values),
    photo: input.photo,
    learned: input.learned,
    nutritionBasisUnit: input.nutritionBasisUnit,
    nutritionBasisQuantity: input.nutritionBasisQuantity,
  });
  const product = {
    id: productId,
    name: input.nameValue,
    densityGMl: input.learned.densityGMl,
    servingUnit: input.learned.servingUnit,
    servingGrams: input.learned.servingGrams,
    nutritionBasisUnit: input.nutritionBasisUnit,
  };
  dispatch({ type: "PRODUCT_CREATED", product });
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

// Standalone, not a hook, so useConfirmStepForm's body stays under the line
// budget - bundled callbacks object rather than closing over hook state.
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
    await saveProduct(input, dispatch);
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

interface ConfirmFormState {
  nameValue: string;
  values: FieldValues;
  setValues: (values: FieldValues) => void;
  flags: string[];
  setFlags: (flags: string[]) => void;
  setError: (error: string | null) => void;
  setIsSaving: (isSaving: boolean) => void;
  revalidate: (values: FieldValues) => void;
}

const buildConfirmStepActions = (props: ConfirmStepProps, state: ConfirmFormState) => {
  const flaggedFields = flaggedFieldSet(state.flags);
  const canSave = [...flaggedFields].every((field) => state.values[field].trim() !== "");
  const setFieldValue = (field: keyof FieldValues, value: string) => state.setValues({ ...state.values, [field]: value });
  const saveInput = { nameValue: state.nameValue, values: state.values, photo: props.photo, learned: props.learned, nutritionBasisUnit: props.nutritionBasisUnit, nutritionBasisQuantity: props.nutritionBasisQuantity };
  const saveCallbacks = { setFlags: state.setFlags, setError: state.setError, setIsSaving: state.setIsSaving };

  return {
    flaggedFields,
    canSave,
    setFieldValue,
    revalidateNow: () => state.revalidate(state.values),
    handleSave: () => saveConfirmedProduct(saveInput, props.dispatch, saveCallbacks),
  };
};

const useConfirmStepForm = (props: ConfirmStepProps): UseConfirmStepFormResult => {
  const [nameValue, setNameValue] = useState(props.name);
  const [values, setValues] = useState(() => toFieldValues(props.parsed));
  const [flags, setFlags] = useState(props.flags);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const revalidate = useCallback((currentValues: FieldValues) => {
    checkNutritionFlags(currentValues)
      .then(setFlags)
      // Transient failure leaves existing flags in place - handleSave's own
      // pre-save check still guards the save.
      .catch(() => {});
  }, []);

  const actions = buildConfirmStepActions(props, { nameValue, values, setValues, flags, setFlags, setError, setIsSaving, revalidate });

  return { nameValue, values, error, isSaving, setNameValue, ...actions };
};

interface ProductNameFieldProps {
  value: string;
  onChange: (value: string) => void;
}

const ProductNameField = ({ value, onChange }: ProductNameFieldProps) => (
  <Field label="Product name" name="name" value={value} onChange={(event) => onChange(event.target.value)} />
);

export const ConfirmStep = (props: ConfirmStepProps) => {
  const form = useConfirmStepForm(props);

  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-lg font-semibold">Confirm nutrition (per {props.nutritionBasisQuantity} {props.nutritionBasisUnit})</h2>
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
