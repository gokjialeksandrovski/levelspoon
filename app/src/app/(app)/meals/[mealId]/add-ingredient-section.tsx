// app/src/app/meals/[mealId]/add-ingredient-section.tsx
"use client";

import { useState } from "react";

import { CaptureWizard } from "./capture-wizard";

interface AddIngredientSectionProps {
  mealId: string;
  onIngredientSaved?: () => void;
}

export const AddIngredientSection = ({ mealId, onIngredientSaved }: AddIngredientSectionProps) => {
  const [isAdding, setIsAdding] = useState(false);

  if (!isAdding) {
    return (
      <button
        type="button"
        onClick={() => setIsAdding(true)}
        className="rounded bg-blue-600 px-4 py-2 text-white"
      >
        Add ingredient
      </button>
    );
  }
  return <CaptureWizard mealId={mealId} onIngredientSaved={onIngredientSaved} />;
};
