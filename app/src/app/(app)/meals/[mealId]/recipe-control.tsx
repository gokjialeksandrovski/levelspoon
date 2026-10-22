"use client";

import { BookmarkSimpleIcon } from "@phosphor-icons/react";
import { useState } from "react";

import type { MealIngredientDetail, MealRecipeLink } from "@/features/meals/actions/meals";
import { divergenceLine } from "@/features/recipes/actions/recipes.utils";
import { withAiEstimateTag } from "@/features/lazy-track/actions/lazy-track.utils";
import { Button } from "@/components/ui/button";
import { InlineMessage } from "@/components/ui/inline-message";

import { EditRecipeSheet } from "./edit-recipe-sheet";
import { SaveRecipeSheet } from "./save-recipe-sheet";

/** The line under the header on a linked meal. The header itself stays
 * ordinal - a meal is still "Meal 2", whatever it was made from. */
export const RecipeSubtitle = ({ recipe }: { recipe: MealRecipeLink | null }) =>
  recipe ? <p className="text-sm text-text-muted wrap-anywhere">From your saved recipes: {withAiEstimateTag(recipe.name, recipe.isAiEstimate)}</p> : null;

/** Sits in the page flow above the ingredients, red, with nothing to dismiss:
 * it is a standing fact about the meal, so it has no exit and needs none.
 *
 * Suppressed when the recipe is merely a subset of the meal - picking a
 * recipe into a meal that already held something else is exactly what the
 * user asked for, not drift, and the line would otherwise fire on that
 * happy path. A genuine change - an amount edited, a row
 * removed - still fails `matches` and is not a subset either, so the line
 * still fires for it. */
export const RecipeDivergence = ({ recipe }: { recipe: MealRecipeLink | null }) =>
  recipe && !recipe.matches && !recipe.recipeIsSubset ? <InlineMessage tone="error">{divergenceLine(recipe.name)}</InlineMessage> : null;

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
  // Bumped on every open, then handed to EditRecipeSheet as `key`. That sheet
  // stays mounted across a reload (useMealDetail never unmounts the ready
  // subtree, so bumpReload alone does not remount it), and its draft is
  // seeded once at mount from the `ingredients` prop - so without a fresh key
  // per open, editing or removing an ingredient and then reopening the sheet
  // would show the stale pre-edit draft, and Save would silently overwrite
  // the edit right back.
  const [openKey, setOpenKey] = useState(0);

  if (ingredients.length === 0) {
    return null;
  }

  const open = () => {
    setOpenKey((key) => key + 1);
    setIsOpen(true);
  };

  if (recipe) {
    return (
      <>
        <Button variant="ghost" className="inline-flex items-center justify-center gap-2" onClick={open}>
          <BookmarkSimpleIcon size={20} />
          Edit this recipe
        </Button>
        <EditRecipeSheet
          key={openKey}
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
      <Button variant="ghost" className="inline-flex items-center justify-center gap-2" onClick={open}>
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
