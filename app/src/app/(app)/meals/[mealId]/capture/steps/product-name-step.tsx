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

import type { WizardAction } from "../capture-wizard.types";

interface ProductNameStepProps {
  dispatch: (action: WizardAction) => void;
}

export const ProductNameStep = ({ dispatch }: ProductNameStepProps) => {
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [manualEntry, setManualEntry] = useState(false);
  const [manualName, setManualName] = useState("");

  const resolveMatch = async (text: string, netWeightText: string | null) => {
    const result = await matchProduct(text);
    dispatch({ type: "MATCH_RESOLVED", nameGuess: text, result, netWeightText });
  };

  const handleSelect = async (photo: File) => {
    setError(null);
    setIsLoading(true);
    try {
      const { text, netWeightText } = await ocrProductName(photo);
      await resolveMatch(text, netWeightText);
    } catch {
      setError("Could not read the product name from the photo.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleManualSubmit = async () => {
    setError(null);
    setIsLoading(true);
    try {
      // No photo was taken on this path, so there is no net weight to read.
      await resolveMatch(manualName, null);
    } catch {
      setError("Could not look up this product name. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  if (manualEntry) {
    return (
      <div className="flex flex-col gap-4">
        <h2 className="text-lg font-semibold">Type the product name</h2>
        <Field
          label="Product name"
          name="manual-product-name"
          value={manualName}
          onChange={(event) => setManualName(event.target.value)}
        />
        {error && <InlineMessage tone="error">{error}</InlineMessage>}
        <Button disabled={isLoading || manualName.trim() === ""} onClick={handleManualSubmit}>
          Continue
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-lg font-semibold">Photograph the product name</h2>
      <PhotoInput label="Product photo" onSelect={handleSelect} />
      {isLoading && <Skeleton className="h-9 w-40" />}
      {error && <InlineMessage tone="error">{error}</InlineMessage>}
      <button type="button" onClick={() => setManualEntry(true)} className="text-sm text-text-muted underline">
        Enter the name manually instead
      </button>
    </div>
  );
};
