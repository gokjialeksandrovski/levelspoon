"use client";

import { useState } from "react";

import { ocrNutritionTable } from "@/actions/ocr";
import { InlineMessage } from "@/components/inline-message";
import { PhotoInput } from "@/components/photo-input";
import { Skeleton } from "@/components/skeleton";
import { TEXT_LINK_SM } from "@/components/tap-target";
import { NOTHING_LEARNED } from "@/lib/measures/learn";

import type { WizardAction } from "../capture-wizard.types";

interface NutritionPhotoStepProps {
  nameGuess: string;
  netWeightText: string | null;
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

interface OcrNutritionCallbacks {
  onPhotoSelected: (photo: File) => void;
  onError: (error: string | null) => void;
  onLoadingChange: (isLoading: boolean) => void;
  dispatch: (action: WizardAction) => void;
}

// Standalone (not a hook, not nested inside one) so both this function's own
// body and useNutritionPhotoStep's own body stay under the line budget -
// this was previously a single 31-line closure nested inside the component,
// which ESLint flags independently of its container's own size.
const handleNutritionPhoto = async (selected: File, nameGuess: string, netWeightText: string | null, callbacks: OcrNutritionCallbacks): Promise<void> => {
  callbacks.onPhotoSelected(selected);
  callbacks.onError(null);
  callbacks.onLoadingChange(true);
  try {
    const read = await ocrNutritionTable(selected, nameGuess, netWeightText);
    if (read.kind === "needs-serving-size") {
      callbacks.dispatch({ type: "SERVING_SIZE_NEEDED", servingSizeText: read.servingSizeText, perServing: read.perServing, name: nameGuess, photo: selected, prefillGrams: read.prefillGrams, unitName: read.unitName });
      return;
    }
    callbacks.dispatch({ type: "NUTRITION_PARSED", parsed: read.values, flags: read.flags, name: nameGuess, photo: selected, learned: read.learned, nutritionBasisUnit: read.nutritionBasisUnit, nutritionBasisQuantity: read.nutritionBasisQuantity });
  } catch {
    callbacks.onError("Could not read the nutrition table from this photo.");
  } finally {
    callbacks.onLoadingChange(false);
  }
};

interface UseNutritionPhotoStepResult {
  error: string | null;
  isLoading: boolean;
  photo: File | null;
  handleSelect: (selected: File) => Promise<void>;
  handleManualEntry: () => void;
}

const useNutritionPhotoStep = (nameGuess: string, netWeightText: string | null, dispatch: (action: WizardAction) => void): UseNutritionPhotoStepResult => {
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [photo, setPhoto] = useState<File | null>(null);

  const callbacks: OcrNutritionCallbacks = { onPhotoSelected: setPhoto, onError: setError, onLoadingChange: setIsLoading, dispatch };
  const handleSelect = (selected: File) => handleNutritionPhoto(selected, nameGuess, netWeightText, callbacks);
  const handleManualEntry = () => {
    if (!photo) {
      return;
    }
    dispatch({ type: "NUTRITION_PARSED", parsed: ALL_NULL_NUTRITION, flags: ALL_NUTRITION_FLAGS, name: nameGuess, photo, learned: NOTHING_LEARNED, nutritionBasisUnit: MANUAL_ENTRY_BASIS_UNIT, nutritionBasisQuantity: MANUAL_ENTRY_BASIS_QUANTITY });
  };

  return { error, isLoading, photo, handleSelect, handleManualEntry };
};

const LoadingSkeletons = () => (
  <div className="flex flex-col gap-2">
    <Skeleton className="h-10 w-full" />
    <Skeleton className="h-10 w-full" />
    <Skeleton className="h-10 w-full" />
  </div>
);

export const NutritionPhotoStep = ({ nameGuess, netWeightText, dispatch }: NutritionPhotoStepProps) => {
  const form = useNutritionPhotoStep(nameGuess, netWeightText, dispatch);

  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-lg font-semibold">Photograph the nutrition table</h2>
      <PhotoInput label="Nutrition table photo" onSelect={form.handleSelect} />
      {form.isLoading && <LoadingSkeletons />}
      {form.error && <InlineMessage tone="error">{form.error}</InlineMessage>}
      {form.error && form.photo && (
        <button type="button" onClick={form.handleManualEntry} className={TEXT_LINK_SM}>
          <span>Enter the values manually instead</span>
        </button>
      )}
    </div>
  );
};
