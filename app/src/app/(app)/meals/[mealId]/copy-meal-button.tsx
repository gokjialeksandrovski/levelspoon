"use client";

import { CheckIcon, CopyIcon } from "@phosphor-icons/react";

import type { MealIngredientDetail } from "@/features/meals/actions/meals";
import { Button } from "@/components/ui/button";

import type { CopiedIngredientsStore } from "./copied-ingredients";
import { ingredientCount, isMealCopied, toggleMeal } from "./copied-ingredients.utils";

interface CopyMealButtonProps {
  ingredients: readonly MealIngredientDetail[];
  copied: CopiedIngredientsStore;
  onAnnounce: (message: string) => void;
}

// Local only, no request. Nothing to copy in a meal with no ingredients.
export const CopyMealButton = ({ ingredients, copied, onAnnounce }: CopyMealButtonProps) => {
  if (ingredients.length === 0) {
    return null;
  }

  const isCopied = isMealCopied(copied.items, ingredients);
  const toggle = () => {
    const next = toggleMeal(copied.items, ingredients);
    const changed = ingredientCount(Math.abs(next.length - copied.items.length));
    copied.replace(next);
    onAnnounce(isCopied ? `${changed} taken off copied list.` : `${changed} copied.`);
  };

  return (
    <Button variant="ghost" onClick={toggle}>
      {isCopied ? <CheckIcon size={20} /> : <CopyIcon size={20} />}
      {isCopied ? "Copied" : "Copy meal"}
    </Button>
  );
};
