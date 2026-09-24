"use client";

import { BookmarkSimpleIcon } from "@phosphor-icons/react";
import { useState } from "react";

import type { MealIngredientDetail, MealRecipeLink } from "@/features/meals/actions/meals";
import { divergenceLine } from "@/features/recipes/actions/recipes.utils";
import { Button } from "@/components/ui/button";
import { InlineMessage } from "@/components/ui/inline-message";

import { EditRecipeSheet } from "./edit-recipe-sheet";
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
  ingredients: MealIngredientDetail[];
  onChanged: () => void;
  onAnnounce: (message: string) => void;
}

// One slot, one control, never both: a meal gets Save as recipe or Edit this
// recipe. A meal with nothing in it gets neither - there is no recipe to file
// and none to edit.
export const RecipeControl = ({ mealId, recipe, ingredients, onChanged, onAnnounce }: RecipeControlProps) => {
  const [isOpen, setIsOpen] = useState(false);

  if (ingredients.length === 0) {
    return null;
  }

  if (recipe) {
    return (
      <>
        <Button variant="ghost" className="inline-flex items-center justify-center gap-2" onClick={() => setIsOpen(true)}>
          <BookmarkSimpleIcon size={20} />
          Edit this recipe
        </Button>
        <EditRecipeSheet
          mealId={mealId}
          recipeName={recipe.name}
          ingredients={ingredients}
          open={isOpen}
          onClose={() => setIsOpen(false)}
          onSaved={(message) => {
            onAnnounce(message);
            onChanged();
          }}
          onMealMissing={onChanged}
        />
      </>
    );
  }

  return (
    <>
      <Button variant="ghost" className="inline-flex items-center justify-center gap-2" onClick={() => setIsOpen(true)}>
        <BookmarkSimpleIcon size={20} />
        Save as recipe
      </Button>
      <SaveRecipeSheet
        mealId={mealId}
        open={isOpen}
        onClose={() => setIsOpen(false)}
        onSaved={(name) => {
          onAnnounce(`Saved as the recipe ${name}.`);
          onChanged();
        }}
        onMealMissing={onChanged}
      />
    </>
  );
};
