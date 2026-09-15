"use client";

import { useState } from "react";

import { ocrProductName } from "@/features/products/actions/ocr";
import { matchProduct } from "@/features/products/actions/products";
import { lookupBarcode } from "@/features/products/actions/barcode";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { InlineMessage } from "@/components/ui/inline-message";
import { PhotoInput } from "@/components/ui/photo-input";
import { Skeleton } from "@/components/ui/skeleton";
import { TEXT_LINK_SM } from "@/components/ui/tap-target";
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
}

const ManualNameEntry = ({ manualName, error, isLoading, onChange, onSubmit }: ManualNameEntryProps) => (
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
  </div>
);

interface PhotoNameEntryProps {
  isLoading: boolean;
  error: string | null;
  onSelect: (photo: File) => void;
  onManualEntry: () => void;
  onBarcodeEntry: () => void;
  onWholeFood: () => void;
}

const PhotoNameEntry = ({ isLoading, error, onSelect, onManualEntry, onBarcodeEntry, onWholeFood }: PhotoNameEntryProps) => (
  <div className="flex flex-col gap-4">
    <h2 className="text-lg font-semibold">Photograph the product name</h2>
    <PhotoInput label="Product photo" onSelect={onSelect} />
    {isLoading && <Skeleton className="h-9 w-40" />}
    {error && <InlineMessage tone="error">{error}</InlineMessage>}
    <button type="button" onClick={onBarcodeEntry} className={TEXT_LINK_SM}>
      <span>Scan barcode instead</span>
    </button>
    <button type="button" onClick={onManualEntry} className={TEXT_LINK_SM}>
      <span>Enter the name manually instead</span>
    </button>
    <button type="button" onClick={onWholeFood} className={TEXT_LINK_SM}>
      <span>Whole food / no packaging</span>
    </button>
  </div>
);

interface BarcodeNameEntryProps {
  isLoading: boolean;
  error: string | null;
  onDetect: (code: string) => void;
  onCancel: () => void;
}

const BarcodeNameEntry = ({ isLoading, error, onDetect, onCancel }: BarcodeNameEntryProps) => (
  <div className="flex flex-col gap-4">
    <h2 className="text-lg font-semibold">Scan the barcode</h2>
    {isLoading ? <Skeleton className="h-48 w-full" /> : <BarcodeScanner onDetect={onDetect} />}
    {error && <InlineMessage tone="error">{error}</InlineMessage>}
    <button type="button" onClick={onCancel} className={TEXT_LINK_SM}>
      <span>Enter the name another way instead</span>
    </button>
  </div>
);

const renderManualMode = (form: UseProductNameStepResult) => (
  <ManualNameEntry
    manualName={form.manualName}
    error={form.error}
    isLoading={form.isLoading}
    onChange={form.setManualName}
    onSubmit={form.handleManualSubmit}
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
