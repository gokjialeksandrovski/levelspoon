"use client";

import { useState } from "react";

import { ocrNutritionTable } from "@/features/products/actions/ocr";
import { Button } from "@/components/ui/button";
import { InlineMessage } from "@/components/ui/inline-message";
import { PhotoInput } from "@/components/ui/photo-input";
import { NOTHING_LEARNED } from "@/lib/measures/learn";

import type { WizardAction } from "../capture-wizard.types";

interface NutritionPhotoStepProps {
  nameGuess: string;
  netWeightText: string | null;
  pendingBarcode: string | null;
  dispatch: (action: WizardAction) => void;
}

const ALL_NUTRITION_FLAGS = [
  "energy_kcal",
  "fat_g",
  "saturates_g",
  "carbohydrate_g",
  "sugars_g",
  "protein_g",
  "salt_g",
];

const ALL_NULL_NUTRITION = {
  energyKcal: null,
  fatG: null,
  saturatesG: null,
  carbohydrateG: null,
  sugarsG: null,
  proteinG: null,
  saltG: null,
};

const MANUAL_ENTRY_BASIS_UNIT = "g";
const MANUAL_ENTRY_BASIS_QUANTITY = 100;

const photoReuseError = (ownerName: string | null): string =>
  ownerName === null
    ? "This label photo already belongs to another product. Take a photo of this product's own label."
    : `This label photo already belongs to ${ownerName}. Take a photo of this product's own label.`;

interface UseNutritionPhotoStepResult {
  error: string | null;
  isLoading: boolean;
  photo: File | null;
  handleSelect: (selected: File) => Promise<void>;
  handleManualEntry: () => void;
}

const useNutritionPhotoStep = (nameGuess: string, netWeightText: string | null, pendingBarcode: string | null, dispatch: (action: WizardAction) => void): UseNutritionPhotoStepResult => {
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [photo, setPhoto] = useState<File | null>(null);

  const handleSelect = async (selected: File): Promise<void> => {
    setPhoto(selected);
    setError(null);
    setIsLoading(true);
    try {
      const read = await ocrNutritionTable(selected, nameGuess, netWeightText);
      if (read.kind === "photo-already-used") {
        // Cleared from state as well as rejected: handleManualEntry carries
        // `photo` forward, which would smuggle the borrowed photo to confirm.
        setPhoto(null);
        setError(photoReuseError(read.ownerName));
        return;
      }
      if (read.kind === "needs-serving-size") {
        dispatch({ type: "SERVING_SIZE_NEEDED", servingSizeText: read.servingSizeText, perServing: read.perServing, name: nameGuess, photo: selected, prefillGrams: read.prefillGrams, unitName: read.unitName, pendingBarcode });
        return;
      }
      dispatch({ type: "NUTRITION_PARSED", parsed: read.values, flags: read.flags, name: nameGuess, photo: selected, learned: read.learned, nutritionBasisUnit: read.nutritionBasisUnit, nutritionBasisQuantity: read.nutritionBasisQuantity, pendingBarcode });
    } catch {
      setError("Could not read the nutrition table from this photo. Retake it with the whole table and its \"per 100g\" heading in frame.");
    } finally {
      setIsLoading(false);
    }
  };
  // No photo is a valid answer, not a failure: the product is saved and
  // logged like any other, it is just private to this user (spec §S2).
  const handleManualEntry = () => {
    dispatch({ type: "NUTRITION_PARSED", parsed: ALL_NULL_NUTRITION, flags: ALL_NUTRITION_FLAGS, name: nameGuess, photo: photo ?? undefined, learned: NOTHING_LEARNED, nutritionBasisUnit: MANUAL_ENTRY_BASIS_UNIT, nutritionBasisQuantity: MANUAL_ENTRY_BASIS_QUANTITY, pendingBarcode });
  };

  return { error, isLoading, photo, handleSelect, handleManualEntry };
};

const READING_LABEL = "Reading the nutrition table…";

// Values are only read against a per-100g (or per-100ml) column; a photo
// cropped below that heading fails however sharp the figures are.
const FRAMING_HINT =
  'Try to fit the whole table in the photo, including the "per 100g" heading at the top.';

// Said where the choice is made, not after the save. Shown only when it is
// true: visibleToUser (products.ts) shares a row that has either a label
// photo or a barcode, so a pending barcode or a photo already in hand would
// make this a false promise - confirm-step states the outcome for those.
const PRIVATE_PRODUCT_HINT =
  "This product will be saved for you, but not for other users. Only products with a label photo or a barcode are shared.";

export const NutritionPhotoStep = ({ nameGuess, netWeightText, pendingBarcode, dispatch }: NutritionPhotoStepProps) => {
  const form = useNutritionPhotoStep(nameGuess, netWeightText, pendingBarcode, dispatch);

  return (
    <div className="flex flex-col gap-6">
      <h2 className="text-lg font-semibold">Reading {nameGuess}</h2>
      <div className="flex flex-col gap-2">
        <PhotoInput
          label="Nutrition table photo"
          hint={FRAMING_HINT}
          onSelect={form.handleSelect}
          scanningLabel={form.isLoading ? READING_LABEL : undefined}
        />
        {form.error && <InlineMessage tone="error">{form.error}</InlineMessage>}
      </div>
      <div className="flex flex-col gap-2">
        {/* Disabled during OCR: wizardReducer applies NUTRITION_PARSED unconditionally,
            so a tap here mid-scan would race the pending dispatch from handleSelect. */}
        <Button variant="ghost" link className="self-start" disabled={form.isLoading} onClick={form.handleManualEntry}>
          {form.photo ? "Enter the values manually instead" : "Enter the values manually"}
        </Button>
        {!form.photo && pendingBarcode === null && (
          <InlineMessage tone="info">{PRIVATE_PRODUCT_HINT}</InlineMessage>
        )}
      </div>
    </div>
  );
};
