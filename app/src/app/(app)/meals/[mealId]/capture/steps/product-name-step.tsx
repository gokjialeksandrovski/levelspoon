"use client";

import { type ChangeEvent, useState } from "react";

import { BarcodeIcon, CameraIcon, CarrotIcon, PencilSimpleIcon, type Icon } from "@phosphor-icons/react";

import { ocrProductName } from "@/features/products/actions/ocr";
import { matchProduct } from "@/features/products/actions/products";
import { lookupBarcode } from "@/features/products/actions/barcode";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { InlineMessage } from "@/components/ui/inline-message";
import { Skeleton } from "@/components/ui/skeleton";
import { BarcodeScanner } from "@/components/ui/barcode-scanner";

import type { WizardAction } from "../capture-wizard.types";

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
  /** Only used by the barcode entry mode's not_found branch - see
   * handleBarcodeDetected below for why it's needed. */
  resetToPhotoMode: () => void;
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

// No photo was taken on this path, so there is no net weight to read.
const handleManualName = async (manualName: string, callbacks: ProductNameCallbacks): Promise<void> => {
  callbacks.onError(null);
  callbacks.onLoadingChange(true);
  try {
    await resolveProductMatch(manualName, null, callbacks.pendingBarcode, callbacks.dispatch);
  } catch {
    callbacks.onError("Could not look up this product name. Please try again.");
  } finally {
    callbacks.onLoadingChange(false);
  }
};

type EntryMode = "photo" | "manual" | "barcode";

const REJECTED_BARCODE_ERROR = "This code isn't a product barcode.";
const BARCODE_LOOKUP_ERROR = "Could not look up this barcode. Please try again.";

// internal_match/external_match change the WizardStep's own `kind`, so
// StepView mounts a different step component entirely - this one unmounts
// on its own. not_found is the one outcome that returns to the SAME
// `product-photo` kind (spec §7), so React never remounts this component
// (same position, same key) and the local `mode` state would otherwise be
// stuck on "barcode" - hence the explicit resetToPhotoMode() call below.
// rejected leaves `mode` alone on purpose: the scanner's own live-scan effect
// only ever runs once per mount (see barcode-scanner.tsx's onDetectRef
// pattern), so staying on this mode and using its "Or upload a photo
// instead" fallback is the realistic retry path, not a fresh camera scan.
const handleBarcodeDetected = async (code: string, callbacks: ProductNameCallbacks): Promise<void> => {
  callbacks.onError(null);
  callbacks.onLoadingChange(true);
  try {
    const result = await lookupBarcode(code);
    if (result.kind === "rejected") {
      callbacks.onError(REJECTED_BARCODE_ERROR);
      return;
    }
    if (result.kind === "not_found") {
      callbacks.resetToPhotoMode();
    }
    callbacks.dispatch({ type: "BARCODE_SCANNED", result });
  } catch {
    callbacks.onError(BARCODE_LOOKUP_ERROR);
  } finally {
    callbacks.onLoadingChange(false);
  }
};

interface UseProductNameStepResult {
  error: string | null;
  isLoading: boolean;
  mode: EntryMode;
  manualName: string;
  setManualName: (value: string) => void;
  showManualEntry: () => void;
  showBarcodeEntry: () => void;
  showPhotoEntry: () => void;
  handleSelect: (photo: File) => Promise<void>;
  handleManualSubmit: () => Promise<void>;
  handleDetect: (code: string) => Promise<void>;
}

const useProductNameStep = (pendingBarcode: string | null, dispatch: (action: WizardAction) => void): UseProductNameStepResult => {
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [mode, setMode] = useState<EntryMode>("photo");
  const [manualName, setManualName] = useState("");
  const switchMode = (next: EntryMode) => { setError(null); setMode(next); };
  const callbacks: ProductNameCallbacks = { onError: setError, onLoadingChange: setIsLoading, dispatch, pendingBarcode, resetToPhotoMode: () => switchMode("photo") };
  return {
    error, isLoading, mode, manualName, setManualName,
    showManualEntry: () => switchMode("manual"),
    showBarcodeEntry: () => switchMode("barcode"),
    showPhotoEntry: () => switchMode("photo"),
    handleSelect: (photo: File) => handlePhotoName(photo, callbacks),
    handleManualSubmit: () => handleManualName(manualName, callbacks),
    handleDetect: (code: string) => handleBarcodeDetected(code, callbacks),
  };
};

interface ManualNameEntryProps {
  manualName: string;
  error: string | null;
  isLoading: boolean;
  onChange: (value: string) => void;
  onSubmit: () => void;
  onCancel: () => void;
}

const ManualNameEntry = ({ manualName, error, isLoading, onChange, onSubmit, onCancel }: ManualNameEntryProps) => (
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
    <Button variant="ghost" link onClick={onCancel}>
      Enter the name another way instead
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

const PhotoRowStatus = ({ isLoading }: { isLoading: boolean }) =>
  isLoading ? (
    <span className="flex items-center gap-2 text-xs text-text-muted">
      <span
        aria-hidden="true"
        className="size-3 shrink-0 animate-spin rounded-full border-2 border-current border-r-transparent"
      />
      Reading the label...
    </span>
  ) : (
    <span className="text-xs text-text-muted">
      Reads the product name off the label. Use when scanning the barcode
      doesn&apos;t provide info for the product.
    </span>
  );

const PhotoOptionRow = ({ isLoading, onSelect }: PhotoOptionRowProps) => (
  <label className={OPTION_ROW_LABEL}>
    <CameraIcon size={24} className="mt-0.5 shrink-0 text-text-muted" aria-hidden="true" />
    <span className="flex flex-col gap-0.5">
      <span className="text-sm font-medium text-text">Photograph the product name</span>
      <PhotoRowStatus isLoading={isLoading} />
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
      description="For a packaged product when the photo or barcode scan doesn't work."
      onClick={onManualEntry}
      disabled={isLoading}
    />
    <EntryOptionRow
      icon={CarrotIcon}
      title="Whole food, no packaging"
      description="For loose fruit, vegetables, eggs, and other unpackaged food."
      onClick={onWholeFood}
      disabled={isLoading}
    />
  </>
);

type EntryOptionListProps = Omit<PhotoNameEntryProps, "error">;

const EntryOptionList = ({ isLoading, onSelect, onManualEntry, onBarcodeEntry, onWholeFood }: EntryOptionListProps) => (
  <div className="flex flex-col divide-y divide-border">
    <BarcodeAndPhotoRows isLoading={isLoading} onSelect={onSelect} onBarcodeEntry={onBarcodeEntry} />
    <ManualAndWholeFoodRows isLoading={isLoading} onManualEntry={onManualEntry} onWholeFood={onWholeFood} />
  </div>
);

const PhotoNameEntry = ({ isLoading, error, onSelect, onManualEntry, onBarcodeEntry, onWholeFood }: PhotoNameEntryProps) => (
  <div className="flex flex-col gap-4">
    <h2 className="text-lg font-semibold">Add a product</h2>
    <EntryOptionList
      isLoading={isLoading}
      onSelect={onSelect}
      onManualEntry={onManualEntry}
      onBarcodeEntry={onBarcodeEntry}
      onWholeFood={onWholeFood}
    />
    {error && <InlineMessage tone="error">{error}</InlineMessage>}
  </div>
);

interface BarcodeNameEntryProps {
  isLoading: boolean;
  error: string | null;
  onDetect: (code: string) => void;
  onCancel: () => void;
}

// BarcodeScanner must stay mounted across loading states: its live-scan
// effect only runs once per mount (see handleBarcodeDetected above), so
// swapping it out for a loading placeholder would restart the camera scan
// on every lookup instead of just overlaying a loading state on top of it.
const BarcodeNameEntry = ({ isLoading, error, onDetect, onCancel }: BarcodeNameEntryProps) => (
  <div className="flex flex-col gap-4">
    <h2 className="text-lg font-semibold">Scan the barcode</h2>
    <div className="relative">
      <BarcodeScanner onDetect={onDetect} />
      {isLoading && <Skeleton className="absolute inset-0" />}
    </div>
    {error && <InlineMessage tone="error">{error}</InlineMessage>}
    <Button variant="ghost" link onClick={onCancel}>
      Enter the name another way instead
    </Button>
  </div>
);

const renderManualMode = (form: UseProductNameStepResult) => (
  <ManualNameEntry
    manualName={form.manualName}
    error={form.error}
    isLoading={form.isLoading}
    onChange={form.setManualName}
    onSubmit={form.handleManualSubmit}
    onCancel={form.showPhotoEntry}
  />
);

const renderBarcodeMode = (form: UseProductNameStepResult) => (
  <BarcodeNameEntry
    isLoading={form.isLoading}
    error={form.error}
    onDetect={form.handleDetect}
    onCancel={form.showPhotoEntry}
  />
);

const renderPhotoMode = (form: UseProductNameStepResult, dispatch: (action: WizardAction) => void) => (
  <PhotoNameEntry
    isLoading={form.isLoading}
    error={form.error}
    onSelect={form.handleSelect}
    onManualEntry={form.showManualEntry}
    onBarcodeEntry={form.showBarcodeEntry}
    onWholeFood={() => dispatch({ type: "WHOLE_FOOD_SEARCH" })}
  />
);

export const ProductNameStep = ({ pendingBarcode, dispatch }: ProductNameStepProps) => {
  const form = useProductNameStep(pendingBarcode, dispatch);

  switch (form.mode) {
    case "manual":
      return renderManualMode(form);
    case "barcode":
      return renderBarcodeMode(form);
    case "photo":
      return renderPhotoMode(form, dispatch);
  }
};
