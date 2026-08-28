// app/src/app/meals/[mealId]/steps/nutrition-photo-step.tsx
"use client";

import { useState } from "react";

import { ocrNutritionTable } from "@/actions/ocr";
import { PhotoInput } from "@/components/photo-input";

import type { WizardAction } from "../capture-wizard.types";

interface NutritionPhotoStepProps {
  nameGuess: string;
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

export const NutritionPhotoStep = ({ nameGuess, dispatch }: NutritionPhotoStepProps) => {
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [photo, setPhoto] = useState<File | null>(null);

  const handleSelect = async (selected: File) => {
    setPhoto(selected);
    setError(null);
    setIsLoading(true);
    try {
      const { values, flags } = await ocrNutritionTable(selected);
      dispatch({ type: "NUTRITION_PARSED", parsed: values, flags, name: nameGuess, photo: selected });
    } catch {
      setError("Could not read the nutrition table from this photo.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleManualEntry = () => {
    if (!photo) {
      return;
    }
    dispatch({
      type: "NUTRITION_PARSED",
      parsed: ALL_NULL_NUTRITION,
      flags: ALL_NUTRITION_FLAGS,
      name: nameGuess,
      photo,
    });
  };

  return (
    <div className="flex flex-col gap-3">
      <h2 className="font-medium">Photograph the nutrition table</h2>
      <PhotoInput label="Nutrition table photo" onSelect={handleSelect} />
      {isLoading && <p className="text-sm text-gray-500">Reading photo…</p>}
      {error && <p className="text-sm text-red-600">{error}</p>}
      {error && photo && (
        <button type="button" onClick={handleManualEntry} className="text-sm text-blue-600">
          Enter the values manually instead
        </button>
      )}
    </div>
  );
};
