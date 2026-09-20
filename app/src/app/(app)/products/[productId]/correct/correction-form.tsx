"use client";

import { CheckCircleIcon } from "@phosphor-icons/react";
import { motion, useReducedMotion } from "motion/react";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { validateNutrition } from "@/features/products/actions/ocr";
import { clearNutritionOverride, renameOwnProduct, saveNutritionOverride } from "@/features/products/actions/products";
import type { ProductForCorrection, SaveNutritionOverrideResult } from "@/features/products/actions/products";
import { AppHeader } from "@/components/layout/app-header";
import { Button } from "@/components/ui/button";
import { Disclosure } from "@/components/ui/disclosure";
import { Field } from "@/components/ui/field";
import { InlineMessage } from "@/components/ui/inline-message";
import { LabelPhotoStrip } from "@/components/ui/label-photo-strip";
import { LiveStatus } from "@/components/ui/live-status";
import { PhotoInput } from "@/components/ui/photo-input";
import { triggerLogSuccessHaptic } from "@/lib/haptics/log-success";
import { contentFadeInitial, contentFadeTransition } from "@/lib/motion/step-transition";
import {
  changedNutritionFields,
  FIELD_LABELS,
  flaggedFieldSet,
  focusFirstFlagged,
  NUTRITION_FIELD_GROUPS,
  toFieldValues,
  toNutritionValues,
} from "@/lib/ocr/nutrition-fields";
import type { FieldValues, NutritionFieldChange } from "@/lib/ocr/nutrition-fields";
import type { NullableNutritionValues } from "@/lib/ocr/provider";

// Reused rather than a second string: correction-form.tsx and
// nutrition-photo-step.tsx are the two write paths that mint a claim-photo
// key, and this is the identical refusal.
import { photoReuseError } from "../../../meals/[mealId]/capture/steps/nutrition-photo-step";

interface CorrectionFormProps {
  product: ProductForCorrection;
  /** Signed by the page; null for a barcode-sourced product, which never had
   * a label photo taken. */
  labelPhotoUrl: string | null;
}

const FLAGGED_ERROR = "This value looks off - please double-check it";
const CANNOT_RENAME_HINT = "Only the person who added this product can rename it.";

const toNullableNutritionValues = (values: ProductForCorrection["nutritionPer100g"]): NullableNutritionValues => values;

// Re-checks validation right before a save rather than trusting the last
// onBlur's `flags` state: a user can click Save while a field is still
// focused (before its blur fires and revalidate resolves), which would
// otherwise let a flagged value through with stale, empty `flags`.
const checkNutritionFlags = async (currentValues: FieldValues): Promise<string[]> => {
  const result = await validateNutrition(toNutritionValues(currentValues));
  return result.flags;
};

interface NutritionFieldsProps {
  values: FieldValues;
  flaggedFields: Set<keyof FieldValues>;
  onFieldChange: (field: keyof FieldValues, value: string) => void;
  onFieldBlur: () => void;
}

// Grouped like the packaging (energy / fat / carbohydrate / protein and salt)
// so a correction can be checked block by block against the label.
const NutritionFields = ({ values, flaggedFields, onFieldChange, onFieldBlur }: NutritionFieldsProps) => (
  <div className="flex flex-col gap-8">
    {NUTRITION_FIELD_GROUPS.map((group) => (
      <div key={group[0]} className="flex flex-col gap-3">
        {group.map((field) => (
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
      </div>
    ))}
  </div>
);

// What the save would actually write: an emptied field is stored as 0, so the
// preview says 0 rather than showing a blank the user could read as "removed".
const savedFigure = (value: string): string => String(Number(value));

const ChangeRow = ({ label, from, to }: { label: string; from: string; to: string }) => (
  <li className="flex items-baseline justify-between gap-3">
    <span className="shrink-0 text-text-muted">{label}</span>
    <span className="text-right tabular-nums text-text">
      <s className="text-text-muted">{from}</s> → {to}
    </span>
  </li>
);

interface CorrectionPreviewProps {
  nameChange: { from: string; to: string } | null;
  changes: NutritionFieldChange[];
}

// Reads back what Save would actually write, before it writes it. Struck-
// through old value, not a colour, carries the before/after distinction.
const CorrectionPreview = ({ nameChange, changes }: CorrectionPreviewProps) => {
  if (!nameChange && changes.length === 0) {
    return null;
  }
  return (
    <div className="flex flex-col gap-2 rounded-surface bg-surface-raised p-4">
      <p className="text-xs font-medium text-text-muted">Saving will change</p>
      <ul className="flex flex-col gap-1 text-sm">
        {nameChange && <ChangeRow label="Product name" from={nameChange.from} to={nameChange.to} />}
        {changes.map((change) => (
          <ChangeRow
            key={change.field}
            label={change.label}
            from={savedFigure(change.from)}
            to={savedFigure(change.to)}
          />
        ))}
      </ul>
    </div>
  );
};

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

// Name and figures are two different writes now: a correction is private to
// this user, a rename still lands on the shared row and only its author may
// make one. The refusable write runs first: saveNutritionOverride can now
// refuse a borrowed claim photo (photo_already_used) as data rather than a
// throw, so running the rename first would leave it committed beside a
// rejected correction - the refusable one goes first, same reasoning as
// createProduct's own upload-after-check ordering.
const applyCorrection = async (
  product: ProductForCorrection,
  name: string,
  values: FieldValues,
  newLabelPhoto: File | null,
  onSaved: () => void,
): Promise<SaveNutritionOverrideResult> => {
  const result = await saveNutritionOverride(product.id, toNutritionValues(values), newLabelPhoto ?? undefined);
  if (result.kind !== "saved") {
    return result;
  }
  if (product.canRename && name.trim() !== product.name) {
    await renameOwnProduct(product.id, name.trim());
  }
  triggerLogSuccessHaptic();
  onSaved();
  return result;
};

interface CorrectionSaveCallbacks {
  setIsSaving: (isSaving: boolean) => void;
  setSaveError: (error: string | null) => void;
  setFlags: (flags: string[]) => void;
  setIsSaved: (isSaved: boolean) => void;
}

export const saveCorrection = async (
  product: ProductForCorrection,
  name: string,
  values: FieldValues,
  newLabelPhoto: File | null,
  callbacks: CorrectionSaveCallbacks,
): Promise<void> => {
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
    const result = await applyCorrection(product, name, values, newLabelPhoto, () => callbacks.setIsSaved(true));
    if (result.kind === "photo_already_used") {
      callbacks.setSaveError(photoReuseError(result.ownerName));
    }
  } catch (error) {
    console.error("Saving a correction failed", error);
    callbacks.setSaveError("Could not save this correction. Please try again.");
  } finally {
    callbacks.setIsSaving(false);
  }
};

interface RevertCallbacks {
  setIsReverting: (isReverting: boolean) => void;
  setSaveError: (error: string | null) => void;
  onReverted: () => void;
}

export const revertCorrection = async (productId: string, callbacks: RevertCallbacks): Promise<void> => {
  callbacks.setIsReverting(true);
  callbacks.setSaveError(null);
  try {
    await clearNutritionOverride(productId);
    callbacks.onReverted();
  } catch {
    callbacks.setSaveError("Could not restore the original values. Please try again.");
  } finally {
    callbacks.setIsReverting(false);
  }
};

// Long enough for the check and "Saved" to register, short enough that it
// never reads as the screen having hung. The save itself already finished -
// this holds the confirmation, it does not hold the write.
const CONFIRMATION_HOLD_MS = 900;

// The screen used to vanish the instant the save resolved, leaving the write
// with no feedback at all. React owns the timer so an early manual back
// cancels it.
const useConfirmedExit = (isSaved: boolean, router: ReturnType<typeof useRouter>): void => {
  useEffect(() => {
    if (!isSaved) return;
    const timer = setTimeout(() => {
      // meal-detail is served from the client Router Cache; without a refresh
      // it would show pre-correction values.
      router.refresh();
      router.back();
    }, CONFIRMATION_HOLD_MS);
    return () => clearTimeout(timer);
  }, [isSaved, router]);
};

interface UseCorrectionFormResult {
  name: string;
  values: FieldValues;
  validateError: boolean;
  saveError: string | null;
  isSaving: boolean;
  isSaved: boolean;
  isReverting: boolean;
  newLabelPhoto: File | null;
  flaggedFields: Set<keyof FieldValues>;
  canSave: boolean;
  nameChange: { from: string; to: string } | null;
  changes: NutritionFieldChange[];
  setName: (value: string) => void;
  setFieldValue: (field: keyof FieldValues, value: string) => void;
  setNewLabelPhoto: (photo: File) => void;
  revalidateNow: () => void;
  handleSave: () => Promise<void>;
  handleRevert: () => Promise<void>;
}

const useCorrectionForm = (product: ProductForCorrection): UseCorrectionFormResult => {
  const router = useRouter();
  const original = toFieldValues(toNullableNutritionValues(product.nutritionPer100g));
  const [name, setName] = useState(product.name);
  const [values, setValues] = useState<FieldValues>(() => original);
  const [flags, setFlags] = useState<string[]>([]);
  const [validateError, setValidateError] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isSaved, setIsSaved] = useState(false);
  const [isReverting, setIsReverting] = useState(false);
  const [newLabelPhoto, setNewLabelPhoto] = useState<File | null>(null);
  useConfirmedExit(isSaved, router);

  const revalidate = useCallback((currentValues: FieldValues) => {
    checkNutritionFlags(currentValues).then((freshFlags) => { setFlags(freshFlags); setValidateError(false); }).catch(() => setValidateError(true));
  }, []);

  useEffect(() => { revalidate(toFieldValues(toNullableNutritionValues(product.nutritionPer100g))); }, [product, revalidate]);

  const flaggedFields = flaggedFieldSet(flags);
  const canSave = flaggedFields.size === 0 || validateError;
  const setFieldValue = (field: keyof FieldValues, value: string) => setValues({ ...values, [field]: value });
  const revalidateNow = () => revalidate(values);
  const handleSave = () => saveCorrection(product, name, values, newLabelPhoto, { setIsSaving, setSaveError, setFlags, setIsSaved });
  const handleRevert = () =>
    revertCorrection(product.id, { setIsReverting, setSaveError, onReverted: () => router.refresh() });

  const nameChange = name.trim() === product.name ? null : { from: product.name, to: name.trim() };

  return {
    name, values, validateError, saveError, isSaving, isSaved, isReverting, newLabelPhoto,
    flaggedFields, canSave, nameChange, changes: changedNutritionFields(original, values),
    setName, setFieldValue, setNewLabelPhoto, revalidateNow, handleSave, handleRevert,
  };
};

// Answers the question the old warning raised: this used to overwrite the
// product for everyone, including in meals already saved. It no longer can.
const PrivateCorrectionNotice = () => (
  <InlineMessage tone="info">
    This correction is yours alone. The shared product keeps the values read off its label.
  </InlineMessage>
);

const SAVED_MESSAGE = "Saved. Only you see these values.";

interface RevertControlProps {
  onRevert: () => void;
  isReverting: boolean;
}

// The way back to the label-photo figures, which the override never destroyed -
// reverting is one DELETE, not a re-entry of seven numbers.
const RevertControl = ({ onRevert, isReverting }: RevertControlProps) => (
  <Button variant="ghost" link pending={isReverting} onClick={onRevert}>
    Use the original values
  </Button>
);

const LABEL_CHANGED_LABEL = "I think this product's label has changed";
// Says what the photo is for and what it is not: it does not overwrite the
// original, and it does not gate the save.
const LABEL_CHANGED_HINT = "Optional. Photograph the new label and we'll check it against the original. Your figures save either way.";
const LABEL_CHANGED_ATTACHED = "New label photo attached. Choosing another replaces it.";

interface LabelChangedDisclosureProps {
  hasOverridePhoto: boolean;
  selectedName: string | null;
  onSelect: (photo: File) => void;
}

const LabelChangedDisclosure = ({ hasOverridePhoto, selectedName, onSelect }: LabelChangedDisclosureProps) => (
  <Disclosure label={LABEL_CHANGED_LABEL}>
    <div className="flex flex-col gap-2 pt-2">
      <PhotoInput label="New label photo" hint={LABEL_CHANGED_HINT} onSelect={onSelect} />
      {selectedName && <InlineMessage tone="info">{selectedName}</InlineMessage>}
      {!selectedName && hasOverridePhoto && <InlineMessage tone="info">{LABEL_CHANGED_ATTACHED}</InlineMessage>}
    </div>
  </Disclosure>
);

// Deliberately not the matcha log-success pulse - that colour is reserved for
// logging a meal, and a correction wants steadiness, not a celebration.
const CorrectionSaved = () => {
  const reduceMotion = useReducedMotion();

  return (
    <motion.p
      aria-hidden="true"
      className="flex items-center justify-center gap-2 py-3 text-sm text-text"
      initial={contentFadeInitial(reduceMotion)}
      animate={{ opacity: 1 }}
      transition={contentFadeTransition(reduceMotion)}
    >
      <CheckCircleIcon />
      {SAVED_MESSAGE}
    </motion.p>
  );
};

interface CorrectionFormBodyProps {
  product: ProductForCorrection;
  labelPhotoUrl: string | null;
  form: UseCorrectionFormResult;
}

const CorrectionFormBody = ({ product, labelPhotoUrl, form }: CorrectionFormBodyProps) => (
  <div className="flex flex-col gap-4">
    {labelPhotoUrl && <LabelPhotoStrip url={labelPhotoUrl} />}
    <h2 className="text-lg font-semibold">Correct nutrition (per {product.nutritionBasisQuantity} {product.nutritionBasisUnit})</h2>
    <PrivateCorrectionNotice />
    <Field
      label="Product name"
      name="name"
      value={form.name}
      readOnly={!product.canRename}
      helperText={product.canRename ? undefined : CANNOT_RENAME_HINT}
      onChange={(event) => form.setName(event.target.value)}
    />
    <NutritionFields
      values={form.values}
      flaggedFields={form.flaggedFields}
      onFieldChange={form.setFieldValue}
      onFieldBlur={form.revalidateNow}
    />
    <LabelChangedDisclosure
      hasOverridePhoto={product.hasOverridePhoto}
      selectedName={form.newLabelPhoto?.name ?? null}
      onSelect={form.setNewLabelPhoto}
    />
    <CorrectionPreview nameChange={form.nameChange} changes={form.changes} />
    <CorrectionFeedback saveError={form.saveError} validateError={form.validateError} />
    {/* The visible line is aria-hidden and this carries the announcement: a
        role="status" that mounts already filled is not reliably read out. */}
    <LiveStatus message={form.isSaved ? SAVED_MESSAGE : ""} />
    {form.isSaved ? (
      <CorrectionSaved />
    ) : (
      <>
        <Button disabled={!form.canSave} pending={form.isSaving} onClick={form.handleSave}>
          Save correction
        </Button>
        {product.hasOverride && <RevertControl onRevert={form.handleRevert} isReverting={form.isReverting} />}
      </>
    )}
  </div>
);

export const CorrectionForm = ({ product, labelPhotoUrl }: CorrectionFormProps) => {
  const router = useRouter();
  const form = useCorrectionForm(product);

  return (
    <>
      <AppHeader variant="back" title="Correct product" onBack={() => router.back()} />
      <main id="main-content" tabIndex={-1} className="flex-1 px-4 py-6 focus:outline-none">
        <CorrectionFormBody product={product} labelPhotoUrl={labelPhotoUrl} form={form} />
      </main>
    </>
  );
};
