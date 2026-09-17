"use client";

import { CheckIcon } from "@phosphor-icons/react";
import Image from "next/image";
import { useCallback, useEffect, useMemo, useState } from "react";

import { checkBarcodeBinding } from "@/features/products/actions/barcode";
import { validateNutrition } from "@/features/products/actions/ocr";
import { createProduct } from "@/features/products/actions/products";
import type { ProductCandidate } from "@/features/products/actions/products";
import { BarcodeAlreadyLinkedError } from "@/features/products/actions/products.errors";
import { BarcodeScanner } from "@/components/ui/barcode-scanner";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { InlineMessage } from "@/components/ui/inline-message";
import { FOCUS_RING } from "@/components/ui/tap-target";
import {
  changedNutritionFields,
  FIELD_LABELS,
  flaggedFieldSet,
  focusFirstFlagged,
  NUTRITION_FIELD_GROUPS,
  toFieldValues,
  toNutritionValues,
} from "@/lib/ocr/nutrition-fields";
import type { FieldValues } from "@/lib/ocr/nutrition-fields";
import type { LearnedMeasures } from "@/lib/measures/learn";
import type { NullableNutritionValues } from "@/lib/ocr/provider";

import { toSelectedProduct } from "../capture-wizard.types";
import type { NutritionOrigin, SelectedProduct, WizardAction } from "../capture-wizard.types";

interface ConfirmStepProps {
  name: string;
  parsed: NullableNutritionValues;
  flags: string[];
  photo?: Blob;
  learned: LearnedMeasures;
  nutritionBasisUnit: string;
  nutritionBasisQuantity: number;
  /** A barcode scanned earlier in this capture that neither per100 nor Open
   * Food Facts recognised - surfaced below as a declinable, default-on
   * checkbox (barcode spec §7). */
  pendingBarcode: string | null;
  barcode: string | null;
  nutritionOrigin: NutritionOrigin | null;
  dispatch: (action: WizardAction) => void;
}

const UNREADABLE_FIELD_ERROR = "Could not read this value - please enter it";
// A value OCR did read, just failing a cross-field plausibility rule (e.g.
// saturates > fat) - "Could not read" would be false here.
const INCONSISTENT_FIELD_ERROR = "This value looks off - please double-check it";
const SAVE_BLOCKED_ERROR = "Please fix the flagged values before saving.";
// Different next step from the same rejection on the product-name step: here
// the product is already in hand, so the way out is the striped code or none.
const REJECTED_BARCODE_ERROR = "That's not a product barcode. Try the striped code on the packaging, or save without one.";
const BARCODE_CHECK_ERROR = "Could not check this barcode. Please try again.";
const SAVE_ERROR = "Could not save this product. Please try again.";
// A second user's scan/OFF-save of the same not-yet-in-per100 barcode won
// the race between this confirm step's own lookup and its save - a distinct,
// named failure (CLAUDE.md Rule 10), not the generic save error.
const BARCODE_CONFLICT_ERROR = "This barcode was just linked to a different product. Search for that product instead of creating a new one.";

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

interface BarcodeBindingCallbacks {
  onAvailable: (barcode: string) => void;
  onConflict: (product: ProductCandidate) => void;
  onRejected: () => void;
  onError: (message: string) => void;
}

// Internal-only check (no OFF call - the product doesn't exist yet, so
// external nutrition data is moot). Shared by the pre-scanned-code mount
// check and the fresh-scan detect handler below (barcode spec §7, T4).
export const resolveBarcodeBinding = async (rawCode: string, callbacks: BarcodeBindingCallbacks): Promise<void> => {
  try {
    const result = await checkBarcodeBinding(rawCode);
    if (result.kind === "available") {
      callbacks.onAvailable(result.barcode);
      return;
    }
    if (result.kind === "already_linked_elsewhere") {
      callbacks.onConflict(result.product);
      return;
    }
    callbacks.onRejected();
  } catch {
    callbacks.onError(BARCODE_CHECK_ERROR);
  }
};

interface BarcodeAttachmentSetters {
  setChecked: (checked: boolean) => void;
  setFreshBarcode: (barcode: string | null) => void;
  setConflict: (product: ProductCandidate | null) => void;
  setScanError: (message: string | null) => void;
}

const checkPendingBarcodeOnMount = (pendingBarcode: string | null, setters: BarcodeAttachmentSetters): void => {
  if (!pendingBarcode) {
    return;
  }
  void resolveBarcodeBinding(pendingBarcode, {
    onAvailable: () => {},
    onConflict: (product) => { setters.setConflict(product); setters.setChecked(false); },
    onRejected: () => setters.setChecked(false),
    onError: () => {},
  });
};

const detectFreshBarcode = (code: string, setters: BarcodeAttachmentSetters, onScanned: () => void): void => {
  setters.setScanError(null);
  void resolveBarcodeBinding(code, {
    onAvailable: (barcode) => { setters.setFreshBarcode(barcode); onScanned(); },
    onConflict: (product) => { setters.setConflict(product); onScanned(); },
    onRejected: () => setters.setScanError(REJECTED_BARCODE_ERROR),
    onError: (message) => setters.setScanError(message),
  });
};

const barcodeToAttachFrom = (
  props: ConfirmStepProps,
  checked: boolean,
  freshBarcode: string | null,
  conflict: ProductCandidate | null,
): string | null => {
  if (props.barcode) return props.barcode;
  if (conflict) return null;
  if (props.pendingBarcode) return checked ? props.pendingBarcode : null;
  return freshBarcode;
};

interface UseBarcodeAttachmentResult {
  barcodeToAttach: string | null;
  checked: boolean;
  conflict: ProductCandidate | null;
  freshBarcode: string | null;
  isScanning: boolean;
  scanError: string | null;
  toggleChecked: (checked: boolean) => void;
  startScan: () => void;
  cancelScan: () => void;
  handleDetect: (code: string) => void;
}

const useBarcodeAttachment = (props: ConfirmStepProps): UseBarcodeAttachmentResult => {
  const [checked, setChecked] = useState(true);
  const [freshBarcode, setFreshBarcode] = useState<string | null>(null);
  const [conflict, setConflict] = useState<ProductCandidate | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  // useState setters are referentially stable, so this memo only recomputes
  // once - giving the effect below a stable dependency instead of a fresh
  // object every render (react-hooks/exhaustive-deps).
  const setters = useMemo(() => ({ setChecked, setFreshBarcode, setConflict, setScanError }), []);

  useEffect(() => checkPendingBarcodeOnMount(props.pendingBarcode, setters), [props.pendingBarcode, setters]);

  return {
    barcodeToAttach: barcodeToAttachFrom(props, checked, freshBarcode, conflict),
    checked, conflict, freshBarcode, isScanning, scanError,
    toggleChecked: setChecked,
    startScan: () => setIsScanning(true),
    cancelScan: () => setIsScanning(false),
    handleDetect: (code: string) => detectFreshBarcode(code, setters, () => setIsScanning(false)),
  };
};

// The values the user just confirmed are the product's nutrition, so the
// amount step's preview needs no refetch of the row that was just written.
const toProductCreatedPayload = (productId: string, input: SaveConfirmInput): SelectedProduct => ({
  id: productId,
  name: input.nameValue,
  brand: null,
  densityGMl: input.learned.densityGMl,
  servingUnit: input.learned.servingUnit,
  servingGrams: input.learned.servingGrams,
  nutritionBasisUnit: input.nutritionBasisUnit,
  nutritionBasisQuantity: input.nutritionBasisQuantity,
  nutritionPerBasis: toNutritionValues(input.values),
});

const saveProduct = async (input: SaveConfirmInput, dispatch: (action: WizardAction) => void): Promise<void> => {
  const { productId } = await createProduct({
    name: input.nameValue,
    nutritionPer100g: toNutritionValues(input.values),
    photo: input.photo,
    learned: input.learned,
    nutritionBasisUnit: input.nutritionBasisUnit,
    nutritionBasisQuantity: input.nutritionBasisQuantity,
    barcode: input.barcode ?? undefined,
    nutritionOrigin: input.nutritionOrigin ?? undefined,
  });
  dispatch({ type: "PRODUCT_CREATED", product: toProductCreatedPayload(productId, input) });
};

interface NutritionFieldsProps {
  values: FieldValues;
  flaggedFields: Set<keyof FieldValues>;
  onFieldChange: (field: keyof FieldValues, value: string) => void;
  onFieldBlur: () => void;
}

// gap-8 between blocks against gap-3 within: seven identical boxes in one
// even stack give the eye nowhere to rest while it checks them off a label.
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
            value={values[field]}
            onChange={(event) => onFieldChange(field, event.target.value)}
            onBlur={onFieldBlur}
            flagged={flaggedFields.has(field)}
            error={errorFor(field, flaggedFields, values)}
          />
        ))}
      </div>
    ))}
  </div>
);

interface SaveConfirmInput {
  nameValue: string;
  values: FieldValues;
  photo?: Blob;
  learned: LearnedMeasures;
  nutritionBasisUnit: string;
  nutritionBasisQuantity: number;
  barcode: string | null;
  nutritionOrigin: NutritionOrigin | null;
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
  } catch (error) {
    callbacks.setError(error instanceof BarcodeAlreadyLinkedError ? BARCODE_CONFLICT_ERROR : SAVE_ERROR);
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

const MANUAL_ORIGIN: NutritionOrigin = "manual";
const DEFAULT_ORIGIN: NutritionOrigin = "label_photo";

/**
 * How the figures being saved actually came to be, not how the step was entered.
 *
 * The `'manual'` enum member existed from the first migration and nothing ever
 * wrote it, so a hand-typed value was stored as if OCR had read it, and a
 * retyped Open Food Facts figure still claimed OFF as its source. Comparing
 * what is being saved against what was parsed answers it for every path at once
 * - including the OCR-failure fallback, which arrives with nothing parsed.
 *
 * `'manual'` describes the numbers, not the proof: the label photo is still
 * attached and still what a later audit checks against.
 */
export const resolveNutritionOrigin = (
  parsed: NullableNutritionValues,
  saved: FieldValues,
  declared: NutritionOrigin | null,
): NutritionOrigin => {
  const changed = changedNutritionFields(toFieldValues(parsed), saved);
  if (changed.length > 0) {
    return MANUAL_ORIGIN;
  }
  return declared ?? DEFAULT_ORIGIN;
};

const buildSaveInput = (props: ConfirmStepProps, state: ConfirmFormState, barcodeToAttach: string | null): SaveConfirmInput => ({
  nameValue: state.nameValue,
  values: state.values,
  photo: props.photo,
  learned: props.learned,
  nutritionBasisUnit: props.nutritionBasisUnit,
  nutritionBasisQuantity: props.nutritionBasisQuantity,
  barcode: barcodeToAttach,
  nutritionOrigin: resolveNutritionOrigin(props.parsed, state.values, props.nutritionOrigin),
});

const buildConfirmStepActions = (props: ConfirmStepProps, state: ConfirmFormState, barcodeToAttach: string | null) => {
  const flaggedFields = flaggedFieldSet(state.flags);
  const canSave = [...flaggedFields].every((field) => state.values[field].trim() !== "");
  const setFieldValue = (field: keyof FieldValues, value: string) => state.setValues({ ...state.values, [field]: value });
  const saveInput = buildSaveInput(props, state, barcodeToAttach);
  const saveCallbacks = { setFlags: state.setFlags, setError: state.setError, setIsSaving: state.setIsSaving };

  return {
    flaggedFields,
    canSave,
    setFieldValue,
    revalidateNow: () => state.revalidate(state.values),
    handleSave: () => saveConfirmedProduct(saveInput, props.dispatch, saveCallbacks),
  };
};

const useConfirmStepForm = (props: ConfirmStepProps, barcodeToAttach: string | null): UseConfirmStepFormResult => {
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

  const actions = buildConfirmStepActions(props, { nameValue, values, setValues, flags, setFlags, setError, setIsSaving, revalidate }, barcodeToAttach);

  return { nameValue, values, error, isSaving, setNameValue, ...actions };
};

interface ProductNameFieldProps {
  value: string;
  onChange: (value: string) => void;
}

const ProductNameField = ({ value, onChange }: ProductNameFieldProps) => (
  <Field label="Product name" name="name" value={value} onChange={(event) => onChange(event.target.value)} />
);

// A data URL, not an object URL. usePreviewUrl gets away with an object URL
// because it creates one in an event handler, well after effects settle; one
// created for a prop is revoked by StrictMode's dev double-effect before the
// expanded <Image> can fetch it again. A data URL has nothing to revoke.
//
// setUrl runs in the reader's callback, never in the effect body, which this
// repo's lint rejects. Null whenever no label photo was taken - the barcode
// path reaches this step straight from Open Food Facts.
const useLabelPhotoUrl = (blob: Blob | undefined): string | null => {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!blob) {
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setUrl(typeof reader.result === "string" ? reader.result : null);
    reader.readAsDataURL(blob);
    return () => reader.abort();
  }, [blob]);

  return url;
};

// Same treatment PhotoPreview uses for an object URL: intrinsic size is
// unknowable here, and the bytes are already local so there is nothing to
// optimise.
const LABEL_PHOTO_SIZE_PX = 300;
const LABEL_PHOTO_EXPANDED_HEIGHT = "max-h-72";

// Collapsed, this is a thumbnail and a label, not a squashed photo: a
// nutrition label is portrait, so any strip-height rendering of it is either
// a crop that misses the table or a postage stamp in an empty bar. The
// thumbnail says which photo, the text says what tapping does.
const CollapsedLabelPhoto = ({ url }: { url: string }) => (
  <span className="flex items-center gap-3">
    <Image
      src={url}
      alt=""
      width={LABEL_PHOTO_SIZE_PX}
      height={LABEL_PHOTO_SIZE_PX}
      unoptimized
      className="size-10 shrink-0 rounded-control object-cover"
    />
    <span className="text-sm text-text-muted">Label photo — tap to check against it</span>
  </span>
);

const ExpandedLabelPhoto = ({ url }: { url: string }) => (
  <Image
    src={url}
    alt="The nutrition label these values were read from"
    width={LABEL_PHOTO_SIZE_PX}
    height={LABEL_PHOTO_SIZE_PX}
    unoptimized
    className={`w-full rounded-control object-contain ${LABEL_PHOTO_EXPANDED_HEIGHT}`}
  />
);

// The screen asks the user to check seven numbers against the label, so the
// label stays reachable while they scroll the fields.
//
// Sticky only while collapsed - pinning the expanded photo would hold ~40% of
// a phone screen for the whole scroll.
//
// No size transition: the only honest way to animate this is a height change,
// which the project's motion rules rule out.
const LabelPhotoStrip = ({ url }: { url: string }) => {
  const [expanded, setExpanded] = useState(false);

  return (
    <button
      type="button"
      onClick={() => setExpanded((open) => !open)}
      aria-expanded={expanded}
      aria-label={expanded ? "Collapse label photo" : "Expand label photo"}
      className={`z-10 -mx-4 block w-[calc(100%+2rem)] border-b border-border bg-surface-raised px-4 py-2 text-left ${expanded ? "" : "sticky top-0"} ${FOCUS_RING}`}
    >
      {expanded ? <ExpandedLabelPhoto url={url} /> : <CollapsedLabelPhoto url={url} />}
    </button>
  );
};

interface BarcodeAttachmentControlProps {
  pendingBarcode: string | null;
  attachment: UseBarcodeAttachmentResult;
  dispatch: (action: WizardAction) => void;
}

interface ConflictNoticeProps {
  conflict: ProductCandidate;
  dispatch: (action: WizardAction) => void;
}

const ConflictNotice = ({ conflict, dispatch }: ConflictNoticeProps) => (
  <div className="flex flex-col gap-2">
    <InlineMessage tone="warning">This barcode is already linked to {conflict.name}.</InlineMessage>
    <Button
      variant="ghost"
      onClick={() => dispatch({ type: "CANDIDATE_CHOSEN", product: toSelectedProduct(conflict), alternatives: [], pendingBarcode: null })}
    >
      Use {conflict.name} instead
    </Button>
  </div>
);

// min-h-11 puts the whole label row on the 44px floor. The native box is
// hidden with appearance-none but stays the real input (keyboard, screen
// reader, form state); the check glyph is drawn over it off peer-checked.
const PendingBarcodeCheckbox = ({ attachment }: { attachment: UseBarcodeAttachmentResult }) => (
  <label className="flex min-h-11 cursor-pointer items-center gap-3 text-sm text-text">
    <span className="relative grid size-6 shrink-0 place-items-center">
      <input
        type="checkbox"
        checked={attachment.checked}
        onChange={(event) => attachment.toggleChecked(event.target.checked)}
        className="peer size-6 cursor-pointer appearance-none rounded-md border-2 border-text-muted transition-colors checked:border-text checked:bg-text focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-text"
      />
      <CheckIcon
        size={16}
        weight="bold"
        aria-hidden="true"
        className="pointer-events-none absolute text-bg opacity-0 transition-opacity peer-checked:opacity-100"
      />
    </span>
    Use the barcode you just scanned for this product
  </label>
);

const FreshScanPrompt = ({ attachment }: { attachment: UseBarcodeAttachmentResult }) => (
  <div className="flex flex-col gap-2">
    <BarcodeScanner onDetect={attachment.handleDetect} />
    {attachment.scanError && <InlineMessage tone="error">{attachment.scanError}</InlineMessage>}
    <Button variant="ghost" link onClick={attachment.cancelScan}>
      Cancel
    </Button>
  </div>
);

const BarcodeAttachmentControl = ({ pendingBarcode, attachment, dispatch }: BarcodeAttachmentControlProps) => {
  if (attachment.conflict) {
    return <ConflictNotice conflict={attachment.conflict} dispatch={dispatch} />;
  }
  if (pendingBarcode) {
    return <PendingBarcodeCheckbox attachment={attachment} />;
  }
  if (attachment.isScanning) {
    return <FreshScanPrompt attachment={attachment} />;
  }
  if (attachment.freshBarcode) {
    return <p className="text-sm text-text-muted">Barcode captured.</p>;
  }
  return (
    <Button variant="ghost" link onClick={attachment.startScan}>
      Scan the barcode to find this product instantly next time
    </Button>
  );
};

// Restated at the save, not only at the manual-entry link: the barcode control
// sits on this screen, so scanning one here is what turns the claim false.
const PrivateProductNotice = () => (
  <InlineMessage tone="info">
    No label photo or barcode, so this product stays yours — nobody else&apos;s search will find it.
  </InlineMessage>
);

export const ConfirmStep = (props: ConfirmStepProps) => {
  const attachment = useBarcodeAttachment(props);
  const form = useConfirmStepForm(props, attachment.barcodeToAttach);
  const photoUrl = useLabelPhotoUrl(props.photo);
  const isPrivate = !props.photo && props.barcode === null && attachment.barcodeToAttach === null;

  return (
    <div className="flex flex-col gap-4">
      {photoUrl && <LabelPhotoStrip url={photoUrl} />}
      <h2 className="text-lg font-semibold">Confirm nutrition (per {props.nutritionBasisQuantity} {props.nutritionBasisUnit})</h2>
      <ProductNameField value={form.nameValue} onChange={form.setNameValue} />
      <NutritionFields values={form.values} flaggedFields={form.flaggedFields} onFieldChange={form.setFieldValue} onFieldBlur={form.revalidateNow} />
      {props.barcode === null && <BarcodeAttachmentControl pendingBarcode={props.pendingBarcode} attachment={attachment} dispatch={props.dispatch} />}
      {form.error && <InlineMessage tone="error">{form.error}</InlineMessage>}
      {isPrivate && <PrivateProductNotice />}
      <Button disabled={!form.canSave} pending={form.isSaving} onClick={form.handleSave}>
        Save product
      </Button>
    </div>
  );
};
