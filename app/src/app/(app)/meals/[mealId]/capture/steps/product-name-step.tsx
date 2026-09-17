"use client";

import { type ChangeEvent, useState } from "react";

import { BarcodeIcon, CameraIcon, CarrotIcon, PencilSimpleIcon, type Icon } from "@phosphor-icons/react";

import { ocrProductName } from "@/features/products/actions/ocr";
import { matchProduct, searchUserProducts } from "@/features/products/actions/products";
import type { MatchResult } from "@/features/products/actions/products";
import { lookupBarcode } from "@/features/products/actions/barcode";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { InlineMessage } from "@/components/ui/inline-message";
import { PhotoPreview, usePreviewUrl } from "@/components/ui/photo-input";
import { BarcodeScanner } from "@/components/ui/barcode-scanner";

import type { PathAction } from "../capture-wizard.path";
import { BACK_TO_OPTIONS_LABEL, type WizardAction } from "../capture-wizard.types";

interface ProductNameStepProps {
  pendingBarcode: string | null;
  dispatch: (action: WizardAction) => void;
}

const resolveProductMatch = async (
  text: string,
  netWeightText: string | null,
  pendingBarcode: string | null,
  dispatch: (action: WizardAction) => void,
): Promise<void> => {
  const result = await matchProduct(text);
  dispatch({ type: "MATCH_RESOLVED", nameGuess: text, result, netWeightText, pendingBarcode });
};

interface ProductNameCallbacks {
  onError: (error: string | null) => void;
  onLoadingChange: (isLoading: boolean) => void;
  dispatch: (action: WizardAction) => void;
  pendingBarcode: string | null;
}

const handlePhotoName = async (photo: File, callbacks: ProductNameCallbacks): Promise<void> => {
  callbacks.onError(null);
  callbacks.onLoadingChange(true);
  try {
    const { text, netWeightText } = await ocrProductName(photo);
    await resolveProductMatch(text, netWeightText, callbacks.pendingBarcode, callbacks.dispatch);
  } catch {
    callbacks.onError("Could not read the product name from the photo.");
  } finally {
    callbacks.onLoadingChange(false);
  }
};

// A typed name is a keyword, not an OCR string, so it goes through
// searchUserProducts and its hits are handed to the reducer as "ambiguous" -
// the pick list. A typed query never auto-accepts a product, however exact it
// looks: the margin rule that makes auto-accept safe is matchProduct's, and it
// scores whole strings. No photo was taken on this path, so no net weight either.
const handleManualName = async (manualName: string, callbacks: ProductNameCallbacks): Promise<void> => {
  callbacks.onError(null);
  callbacks.onLoadingChange(true);
  try {
    const candidates = await searchUserProducts(manualName);
    const result: MatchResult = candidates.length === 0 ? { kind: "no_match" } : { kind: "ambiguous", candidates };
    callbacks.dispatch({
      type: "MATCH_RESOLVED",
      nameGuess: manualName,
      result,
      netWeightText: null,
      pendingBarcode: callbacks.pendingBarcode,
    });
  } catch {
    callbacks.onError("Could not search for this product name. Please try again.");
  } finally {
    callbacks.onLoadingChange(false);
  }
};

const REJECTED_BARCODE_ERROR = "That's not a product barcode. Photograph the product name instead, or type it in.";
const BARCODE_LOOKUP_ERROR = "Could not look up this barcode. Please try again.";

// rejected stays on this step on purpose: the live-scan effect only runs once
// per mount, so the photo fallback is the real retry path, not a fresh scan.
const handleBarcodeDetected = async (code: string, callbacks: ProductNameCallbacks): Promise<void> => {
  callbacks.onError(null);
  callbacks.onLoadingChange(true);
  try {
    const result = await lookupBarcode(code);
    if (result.kind === "rejected") {
      callbacks.onError(REJECTED_BARCODE_ERROR);
      return;
    }
    callbacks.dispatch({ type: "BARCODE_SCANNED", result });
  } catch {
    callbacks.onError(BARCODE_LOOKUP_ERROR);
  } finally {
    callbacks.onLoadingChange(false);
  }
};

interface UseStepRequestResult {
  error: string | null;
  isLoading: boolean;
  callbacks: ProductNameCallbacks;
}

const useStepRequest = (pendingBarcode: string | null, dispatch: (action: WizardAction) => void): UseStepRequestResult => {
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  return { error, isLoading, callbacks: { onError: setError, onLoadingChange: setIsLoading, dispatch, pendingBarcode } };
};

interface ManualNameEntryProps {
  manualName: string;
  error: string | null;
  isLoading: boolean;
  onChange: (value: string) => void;
  onSubmit: () => void;
  onBack: () => void;
}

const ManualNameEntry = ({ manualName, error, isLoading, onChange, onSubmit, onBack }: ManualNameEntryProps) => (
  <div className="flex flex-col gap-4">
    <h2 className="text-lg font-semibold">Type the product name</h2>
    <Field
      label="Product name"
      name="manual-product-name"
      value={manualName}
      onChange={(event) => onChange(event.target.value)}
    />
    {error && <InlineMessage tone="error">{error}</InlineMessage>}
    <Button disabled={manualName.trim() === ""} pending={isLoading} onClick={onSubmit}>
      Continue
    </Button>
    <Button variant="ghost" link onClick={onBack}>
      {BACK_TO_OPTIONS_LABEL}
    </Button>
  </div>
);

// No border-radius: this is a full-bleed list row, not a standalone control -
// rounding it would curve the divide-y hairline inward at both ends instead
// of running edge to edge, which reads as separate capsules, not one list.
// Layout only - callers add their own focus-visible (button) or focus-within
// (label wrapping a hidden input, which never receives focus itself) ring.
const OPTION_ROW_LAYOUT =
  "flex w-full cursor-pointer items-start gap-3 px-1 py-3 text-left transition-colors hover:bg-surface-raised active:bg-surface-raised";
const OPTION_ROW_BUTTON = `${OPTION_ROW_LAYOUT} focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-text disabled:opacity-50 disabled:pointer-events-none`;
const OPTION_ROW_LABEL = `${OPTION_ROW_LAYOUT} relative focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-text`;

interface EntryOptionRowProps {
  icon: Icon;
  title: string;
  description: string;
  onClick: () => void;
  disabled?: boolean;
}

const EntryOptionRow = ({ icon: RowIcon, title, description, onClick, disabled }: EntryOptionRowProps) => (
  <button type="button" onClick={onClick} disabled={disabled} className={OPTION_ROW_BUTTON}>
    <RowIcon size={24} className="mt-0.5 shrink-0 text-text-muted" aria-hidden="true" />
    <span className="flex flex-col gap-0.5">
      <span className="text-sm font-medium text-text">{title}</span>
      <span className="text-xs text-text-muted">{description}</span>
    </span>
  </button>
);

const handlePhotoRowChange = (event: ChangeEvent<HTMLInputElement>, onSelect: (photo: File) => void): void => {
  const file = event.target.files?.[0];
  if (!file) {
    return;
  }
  onSelect(file);
  event.target.value = "";
};

interface PhotoOptionRowProps {
  isLoading: boolean;
  onSelect: (photo: File) => void;
}

const PHOTO_ROW_DESCRIPTION = "Reads the name off the packaging. Best when there's no barcode.";

// One line above the list rather than a clause bolted onto each of the four:
// the fact is the same for all of them, and repeating it four times is how a
// list of options stops being scannable.
const ALREADY_ADDED_HINT = "Added this before? Any of these finds it — no label photo needed.";

const PhotoOptionRow = ({ isLoading, onSelect }: PhotoOptionRowProps) => (
  <label className={OPTION_ROW_LABEL}>
    <CameraIcon size={24} className="mt-0.5 shrink-0 text-text-muted" aria-hidden="true" />
    <span className="flex flex-col gap-0.5">
      <span className="text-sm font-medium text-text">Photograph the product name</span>
      <span className="text-xs text-text-muted">{PHOTO_ROW_DESCRIPTION}</span>
    </span>
    <input
      type="file"
      accept="image/*"
      capture="environment"
      aria-label="Product photo"
      disabled={isLoading}
      onChange={(event) => handlePhotoRowChange(event, onSelect)}
      className="absolute inset-0 cursor-pointer opacity-0 disabled:cursor-not-allowed"
    />
  </label>
);

interface PhotoNameEntryProps {
  isLoading: boolean;
  error: string | null;
  previewUrl: string | null;
  onSelect: (photo: File) => void;
  onManualEntry: () => void;
  onBarcodeEntry: () => void;
  onWholeFood: () => void;
}

interface BarcodeAndPhotoRowsProps {
  isLoading: boolean;
  onSelect: (photo: File) => void;
  onBarcodeEntry: () => void;
}

const BarcodeAndPhotoRows = ({
  isLoading,
  onSelect,
  onBarcodeEntry,
}: BarcodeAndPhotoRowsProps) => (
  <>
    <EntryOptionRow
      icon={BarcodeIcon}
      title="Scan the barcode"
      description="Finds the product automatically. Easiest, try this first."
      onClick={onBarcodeEntry}
      disabled={isLoading}
    />
    <PhotoOptionRow isLoading={isLoading} onSelect={onSelect} />
  </>
);

interface ManualAndWholeFoodRowsProps {
  isLoading: boolean;
  onManualEntry: () => void;
  onWholeFood: () => void;
}

const ManualAndWholeFoodRows = ({ isLoading, onManualEntry, onWholeFood }: ManualAndWholeFoodRowsProps) => (
  <>
    <EntryOptionRow
      icon={PencilSimpleIcon}
      title="Type a packaged product's name"
      description="When the scan and the photo both come up empty."
      onClick={onManualEntry}
      disabled={isLoading}
    />
    <EntryOptionRow
      icon={CarrotIcon}
      title="Whole food, no packaging"
      description="Loose fruit, vegetables, eggs - anything with no label."
      onClick={onWholeFood}
      disabled={isLoading}
    />
  </>
);

type EntryOptionListProps = Omit<PhotoNameEntryProps, "error" | "previewUrl">;

const EntryOptionList = ({ isLoading, onSelect, onManualEntry, onBarcodeEntry, onWholeFood }: EntryOptionListProps) => (
  <div className="flex flex-col divide-y divide-border">
    <BarcodeAndPhotoRows isLoading={isLoading} onSelect={onSelect} onBarcodeEntry={onBarcodeEntry} />
    <ManualAndWholeFoodRows isLoading={isLoading} onManualEntry={onManualEntry} onWholeFood={onWholeFood} />
  </div>
);

const READING_NAME_LABEL = "Reading the product name…";

// The option rows are all disabled while the photo is read, so showing the
// photo beats four dead rows and a 12px spinner.
const PhotoEntryBody = ({ isLoading, previewUrl, onSelect, onManualEntry, onBarcodeEntry, onWholeFood }: Omit<PhotoNameEntryProps, "error">) =>
  isLoading && previewUrl ? (
    <PhotoPreview previewUrl={previewUrl} scanningLabel={READING_NAME_LABEL} />
  ) : (
    <EntryOptionList
      isLoading={isLoading}
      onSelect={onSelect}
      onManualEntry={onManualEntry}
      onBarcodeEntry={onBarcodeEntry}
      onWholeFood={onWholeFood}
    />
  );

const PhotoNameEntry = ({ error, ...body }: PhotoNameEntryProps) => (
  <div className="flex flex-col gap-4">
    <div className="flex flex-col gap-1">
      <h2 className="text-lg font-semibold">Add a product</h2>
      <p className="text-sm text-text-muted">{ALREADY_ADDED_HINT}</p>
    </div>
    <PhotoEntryBody {...body} />
    {error && <InlineMessage tone="error">{error}</InlineMessage>}
  </div>
);

interface BarcodeNameEntryProps {
  isLoading: boolean;
  error: string | null;
  onDetect: (code: string) => void;
  onBack: () => void;
}

const BARCODE_LOOKUP_LABEL = "Looking up the code…";

// BarcodeScanner must stay mounted across loading states: its live-scan
// effect only runs once per mount (see handleBarcodeDetected above), so
// swapping it out for a loading placeholder would restart the camera scan
// on every lookup instead of just overlaying a loading state on top of it.
const BarcodeNameEntry = ({ isLoading, error, onDetect, onBack }: BarcodeNameEntryProps) => (
  <div className="flex flex-col gap-4">
    <h2 className="text-lg font-semibold">Scan the barcode</h2>
    <BarcodeScanner onDetect={onDetect} scanningLabel={isLoading ? BARCODE_LOOKUP_LABEL : undefined} />
    {error && <InlineMessage tone="error">{error}</InlineMessage>}
    <Button variant="ghost" link onClick={onBack}>
      {BACK_TO_OPTIONS_LABEL}
    </Button>
  </div>
);

export const ProductNameStep = ({ pendingBarcode, dispatch }: ProductNameStepProps) => {
  const { error, isLoading, callbacks } = useStepRequest(pendingBarcode, dispatch);
  const { previewUrl, showPreview } = usePreviewUrl();

  return (
    <PhotoNameEntry
      isLoading={isLoading}
      error={error}
      previewUrl={previewUrl}
      onSelect={(photo) => {
        showPreview(photo);
        void handlePhotoName(photo, callbacks);
      }}
      onManualEntry={() => dispatch({ type: "MANUAL_NAME_ENTRY", pendingBarcode })}
      onBarcodeEntry={() => dispatch({ type: "BARCODE_ENTRY", pendingBarcode })}
      onWholeFood={() => dispatch({ type: "WHOLE_FOOD_SEARCH" })}
    />
  );
};

interface ProductSubStepProps {
  pendingBarcode: string | null;
  dispatch: (action: PathAction) => void;
}

export const ManualNameStep = ({ pendingBarcode, dispatch }: ProductSubStepProps) => {
  const { error, isLoading, callbacks } = useStepRequest(pendingBarcode, dispatch);
  const [manualName, setManualName] = useState("");

  return (
    <ManualNameEntry
      manualName={manualName}
      error={error}
      isLoading={isLoading}
      onChange={setManualName}
      onSubmit={() => void handleManualName(manualName, callbacks)}
      onBack={() => dispatch({ type: "BACK" })}
    />
  );
};

export const BarcodeNameStep = ({ pendingBarcode, dispatch }: ProductSubStepProps) => {
  const { error, isLoading, callbacks } = useStepRequest(pendingBarcode, dispatch);

  return (
    <BarcodeNameEntry
      isLoading={isLoading}
      error={error}
      onDetect={(code) => void handleBarcodeDetected(code, callbacks)}
      onBack={() => dispatch({ type: "BACK" })}
    />
  );
};
