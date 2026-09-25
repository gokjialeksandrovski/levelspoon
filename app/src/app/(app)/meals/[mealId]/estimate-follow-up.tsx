"use client";

import Link from "next/link";
import { useState } from "react";

import { undoMealEstimate } from "@/features/lazy-track/actions/lazy-track";
import { isEstimateUntouched, REESTIMATE_PARAM } from "@/features/lazy-track/actions/lazy-track.utils";
import type { MealIngredientDetail } from "@/features/meals/actions/meals";
import { Button, buttonClassName } from "@/components/ui/button";
import { InlineMessage } from "@/components/ui/inline-message";

const UNDO_FAILED = "Couldn't undo it. Try again.";
const MEAL_MISSING = "This meal is gone.";

interface EstimateFollowUpProps {
  mealId: string;
  /** The description the estimate came from, off the URL; null when the page
   * was not reached straight from an estimate. */
  description: string | null;
  ingredients: MealIngredientDetail[];
  onChanged: () => void;
  onAnnounce: (message: string) => void;
}

const reestimateHref = (mealId: string, description: string): string =>
  `/meals/${mealId}/capture?${new URLSearchParams({ [REESTIMATE_PARAM]: description })}`;

/**
 * Lazy track logs before anyone checks it, so this is its exit (global Rule
 * 21): Undo takes the guess back, Describe again replaces it. Shown only
 * straight after an estimate and only while every guess is untouched - once
 * the user edits one, both actions would remove only part of what they see.
 */
export const EstimateFollowUp = ({ mealId, description, ingredients, onChanged, onAnnounce }: EstimateFollowUpProps) => {
  const [isUndoing, setIsUndoing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (description === null || !isEstimateUntouched(ingredients)) return null;

  const undo = async () => {
    setError(null);
    setIsUndoing(true);
    try {
      const result = await undoMealEstimate(mealId);
      if (result.kind === "meal_missing") {
        setError(MEAL_MISSING);
        return;
      }
      onAnnounce("Estimate removed.");
      onChanged();
    } catch (caught) {
      console.error("undoMealEstimate failed", caught);
      setError(UNDO_FAILED);
    } finally {
      setIsUndoing(false);
    }
  };

  return (
    <div className="mt-4 flex flex-col gap-1">
      <div className="flex flex-wrap items-center gap-x-3 text-sm text-text-muted">
        <span>Rough estimate. Not right?</span>
        <Link href={reestimateHref(mealId, description)} className={buttonClassName("primary", "", true)}>
          Describe again
        </Link>
        <Button variant="ghost" link pending={isUndoing} onClick={() => void undo()}>
          Undo
        </Button>
      </div>
      {error && <InlineMessage tone="error">{error}</InlineMessage>}
    </div>
  );
};
