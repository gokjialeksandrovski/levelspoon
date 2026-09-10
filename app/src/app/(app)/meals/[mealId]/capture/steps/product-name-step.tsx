// app/src/app/meals/[mealId]/steps/product-name-step.tsx
"use client";

import { useState } from "react";

import { ocrProductName } from "@/actions/ocr";
import { matchProduct } from "@/actions/products";
import { Button } from "@/components/button";
import { Field } from "@/components/field";
import { InlineMessage } from "@/components/inline-message";
import { PhotoInput } from "@/components/photo-input";
import { Skeleton } from "@/components/skeleton";
import { TAP_HIT_AREA_SM } from "@/components/tap-target";

import type { WizardAction } from "../capture-wizard.types";

interface ProductNameStepProps {
  dispatch: (action: WizardAction) => void;
}

const resolveProductMatch = async (text: string, netWeightText: string | null, dispatch: (action: WizardAction) => void): Promise<void> => {
  const result = await matchProduct(text);
  dispatch({ type: "MATCH_RESOLVED", nameGuess: text, result, netWeightText });
};

interface ProductNameCallbacks {
  onError: (error: string | null) => void;
  onLoadingChange: (isLoading: boolean) => void;
  dispatch: (action: WizardAction) => void;
}

const handlePhotoName = async (photo: File, callbacks: ProductNameCallbacks): Promise<void> => {
  callbacks.onError(null);
  callbacks.onLoadingChange(true);
  try {
    const { text, netWeightText } = await ocrProductName(photo);
    await resolveProductMatch(text, netWeightText, callbacks.dispatch);
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
    await resolveProductMatch(manualName, null, callbacks.dispatch);
  } catch {
    callbacks.onError("Could not look up this product name. Please try again.");
  } finally {
    callbacks.onLoadingChange(false);
  }
};

interface UseProductNameStepResult {
  error: string | null;
  isLoading: boolean;
  manualEntry: boolean;
  manualName: string;
  setManualName: (value: string) => void;
  showManualEntry: () => void;
  handleSelect: (photo: File) => Promise<void>;
  handleManualSubmit: () => Promise<void>;
}

const useProductNameStep = (dispatch: (action: WizardAction) => void): UseProductNameStepResult => {
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [manualEntry, setManualEntry] = useState(false);
  const [manualName, setManualName] = useState("");

  const callbacks: ProductNameCallbacks = { onError: setError, onLoadingChange: setIsLoading, dispatch };
  const handleSelect = (photo: File) => handlePhotoName(photo, callbacks);
  const handleManualSubmit = () => handleManualName(manualName, callbacks);

  return { error, isLoading, manualEntry, manualName, setManualName, showManualEntry: () => setManualEntry(true), handleSelect, handleManualSubmit };
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
    <Button disabled={isLoading || manualName.trim() === ""} onClick={onSubmit}>
      Continue
    </Button>
  </div>
);

interface PhotoNameEntryProps {
  isLoading: boolean;
  error: string | null;
  onSelect: (photo: File) => void;
  onManualEntry: () => void;
}

const PhotoNameEntry = ({ isLoading, error, onSelect, onManualEntry }: PhotoNameEntryProps) => (
  <div className="flex flex-col gap-4">
    <h2 className="text-lg font-semibold">Photograph the product name</h2>
    <PhotoInput label="Product photo" onSelect={onSelect} />
    {isLoading && <Skeleton className="h-9 w-40" />}
    {error && <InlineMessage tone="error">{error}</InlineMessage>}
    <button type="button" onClick={onManualEntry} className={`${TAP_HIT_AREA_SM} text-sm text-text-muted underline`}>
      Enter the name manually instead
    </button>
  </div>
);

export const ProductNameStep = ({ dispatch }: ProductNameStepProps) => {
  const form = useProductNameStep(dispatch);

  return form.manualEntry ? (
    <ManualNameEntry
      manualName={form.manualName}
      error={form.error}
      isLoading={form.isLoading}
      onChange={form.setManualName}
      onSubmit={form.handleManualSubmit}
    />
  ) : (
    <PhotoNameEntry
      isLoading={form.isLoading}
      error={form.error}
      onSelect={form.handleSelect}
      onManualEntry={form.showManualEntry}
    />
  );
};
