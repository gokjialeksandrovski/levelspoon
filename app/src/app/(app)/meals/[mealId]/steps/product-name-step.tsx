// app/src/app/meals/[mealId]/steps/product-name-step.tsx
"use client";

import { useState } from "react";

import { ocrProductName } from "@/actions/ocr";
import { matchProduct } from "@/actions/products";
import { PhotoInput } from "@/components/photo-input";

import type { WizardAction } from "../capture-wizard.types";

interface ProductNameStepProps {
  dispatch: (action: WizardAction) => void;
}

export const ProductNameStep = ({ dispatch }: ProductNameStepProps) => {
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [manualEntry, setManualEntry] = useState(false);
  const [manualName, setManualName] = useState("");

  const resolveMatch = async (text: string) => {
    const result = await matchProduct(text);
    dispatch({ type: "MATCH_RESOLVED", nameGuess: text, result });
  };

  const handleSelect = async (photo: File) => {
    setError(null);
    setIsLoading(true);
    try {
      const { text } = await ocrProductName(photo);
      await resolveMatch(text);
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
      await resolveMatch(manualName);
    } catch {
      setError("Could not look up this product name. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  if (manualEntry) {
    return (
      <div className="flex flex-col gap-3">
        <h2 className="font-medium">Type the product name</h2>
        <label htmlFor="manual-product-name" className="text-sm font-medium text-gray-700">
          Product name
        </label>
        <input
          id="manual-product-name"
          value={manualName}
          onChange={(event) => setManualName(event.target.value)}
          className="rounded border border-gray-300 px-3 py-2"
        />
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button
          type="button"
          disabled={isLoading || manualName.trim() === ""}
          onClick={handleManualSubmit}
          className="rounded bg-blue-600 px-4 py-2 text-white disabled:opacity-50"
        >
          Continue
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <h2 className="font-medium">Photograph the product name</h2>
      <PhotoInput label="Product photo" onSelect={handleSelect} />
      {isLoading && <p className="text-sm text-gray-500">Reading photo…</p>}
      {error && <p className="text-sm text-red-600">{error}</p>}
      <button type="button" onClick={() => setManualEntry(true)} className="text-sm text-blue-600">
        Enter the name manually instead
      </button>
    </div>
  );
};
