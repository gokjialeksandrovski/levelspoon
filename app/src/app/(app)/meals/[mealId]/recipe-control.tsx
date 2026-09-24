"use client";

import { BookmarkSimpleIcon } from "@phosphor-icons/react";
import { useState } from "react";

import type { MealRecipeLink } from "@/features/meals/actions/meals";
import { divergenceLine } from "@/features/recipes/actions/recipes.utils";
import { Button } from "@/components/ui/button";
import { InlineMessage } from "@/components/ui/inline-message";

import { SaveRecipeSheet } from "./save-recipe-sheet";

/** The line under the header on a linked meal. The header itself stays
 * ordinal - a meal is still "Meal 2", whatever it was made from. */
export const RecipeSubtitle = ({ recipe }: { recipe: MealRecipeLink | null }) =>
  recipe ? <p className="text-sm text-text-muted">From your saved recipes: {recipe.name}</p> : null;

/** Sits in the page flow above the ingredients, red, with nothing to dismiss:
 * it is a standing fact about the meal, so it has no exit and needs none. */
export const RecipeDivergence = ({ recipe }: { recipe: MealRecipeLink | null }) =>
  recipe && !recipe.matches ? <InlineMessage tone="error">{divergenceLine(recipe.name)}</InlineMessage> : null;

interface RecipeControlProps {
  mealId: string;
  recipe: MealRecipeLink | null;
  hasIngredients: boolean;
  onChanged: () => void;
}

// One slot, one control, never both. A meal with nothing in it gets neither -
// there is no recipe to file and none to edit.
export const RecipeControl = ({ mealId, recipe, hasIngredients, onChanged }: RecipeControlProps) => {
  const [isSaving, setIsSaving] = useState(false);

  if (!hasIngredients || recipe) {
    return null;
  }

  return (
    <>
      <Button variant="ghost" className="inline-flex items-center justify-center gap-2" onClick={() => setIsSaving(true)}>
        <BookmarkSimpleIcon size={20} />
        Save as recipe
      </Button>
      <SaveRecipeSheet
        mealId={mealId}
        open={isSaving}
        onClose={() => setIsSaving(false)}
        onSaved={onChanged}
        onMealMissing={onChanged}
      />
    </>
  );
};
