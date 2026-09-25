"use client";

import { useState } from "react";

import { deleteRecipe, enterRecipe, renameRecipe } from "@/features/recipes/actions/recipes";
import type { RecipeSummary } from "@/features/recipes/actions/recipes.store";
import { isValidRecipeName } from "@/features/recipes/actions/recipes.utils";
import { withAiEstimateTag } from "@/features/lazy-track/actions/lazy-track.utils";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { InlineMessage } from "@/components/ui/inline-message";
import { Skeleton } from "@/components/ui/skeleton";

import type { PathAction } from "../capture-wizard.path";
import { BACK_TO_OPTIONS_LABEL } from "../capture-wizard.types";

// A full-width list row, structurally the same shape as the entry options -
// not a CTA, so it stays a raw button (CLAUDE.md, "App conventions").
const RECIPE_ROW_CLASS =
  "flex w-full cursor-pointer flex-col gap-0.5 px-1 py-3 text-left transition-colors hover:bg-surface-raised active:bg-surface-raised focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-text disabled:opacity-50";

const macroLine = (recipe: RecipeSummary): string =>
  `${Math.round(recipe.total.energyKcal)} kcal · P ${Math.round(recipe.total.proteinG)}g · C ${Math.round(recipe.total.carbohydrateG)}g · F ${Math.round(recipe.total.fatG)}g`;

// Escape is the keyboard half of the exit for both inline row modes below
// (Rule 21). Neither is overlay-shaped, so there is no backdrop to pair it
// with - Escape alone closes the gap.
const handleEscape = (onCancel: () => void) => (event: React.KeyboardEvent) => {
  if (event.key === "Escape") onCancel();
};

interface RenameEditorProps {
  recipe: RecipeSummary;
  onDone: () => void;
  onRenamed: () => void;
}

const RENAME_FAILED_MESSAGE = "Couldn't rename it. Try again.";

// Cancel restores the name the editor opened with and fires no request: the
// draft is local state, and nothing is re-fetched to undo it.
const RenameEditor = ({ recipe, onDone, onRenamed }: RenameEditorProps) => {
  const [draft, setDraft] = useState(recipe.name);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const save = async () => {
    setIsSaving(true);
    setError(null);
    try {
      const result = await renameRecipe(recipe.id, draft);
      if (result.kind === "renamed") {
        onRenamed();
        onDone();
        return;
      }
      setError(result.kind === "invalid_name" ? "Give the recipe a name." : "That recipe is gone.");
    } catch {
      setError(RENAME_FAILED_MESSAGE);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="flex flex-col gap-2 py-3" onKeyDown={handleEscape(onDone)}>
      <Field label="Recipe name" name={`rename-${recipe.id}`} value={draft} onChange={(event) => setDraft(event.target.value)} autoFocus />
      {error && <InlineMessage tone="error">{error}</InlineMessage>}
      <div className="flex gap-2">
        <Button className="flex-1" disabled={!isValidRecipeName(draft)} pending={isSaving} onClick={() => void save()}>
          Save name
        </Button>
        {/* Disabled while saving, not just visually deferred to it - a fast
         * Save-then-Cancel must not let the rename land after the user backed
         * out (Rule 21: cancel fires no request, but only if it cannot race one
         * already in flight). */}
        <Button variant="ghost" className="flex-1" disabled={isSaving} onClick={onDone}>
          Cancel rename
        </Button>
      </div>
    </div>
  );
};

interface DeleteControlProps {
  recipe: RecipeSummary;
  onDeleted: () => void;
}

const DELETE_FAILED_MESSAGE = "Couldn't delete it. Try again.";

// Arms first, and arming fires no request - the same shape the weight goal's
// delete uses. The resting control is as quiet as Rename beside it.
const DeleteControl = ({ recipe, onDeleted }: DeleteControlProps) => {
  const [isArmed, setIsArmed] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isArmed) {
    return (
      <Button variant="ghost" link aria-label={`Delete ${recipe.name}`} onClick={() => setIsArmed(true)}>
        Delete
      </Button>
    );
  }

  const remove = async () => {
    setError(null);
    try {
      await deleteRecipe(recipe.id);
      onDeleted();
    } catch {
      setError(DELETE_FAILED_MESSAGE);
    }
  };

  return (
    <span className="flex flex-col gap-2" onKeyDown={handleEscape(() => setIsArmed(false))}>
      <span className="flex gap-2">
        <Button variant="danger" link onClick={() => void remove()}>
          Delete for good
        </Button>
        <Button variant="ghost" link onClick={() => setIsArmed(false)}>
          Keep it
        </Button>
      </span>
      {error && <InlineMessage tone="error">{error}</InlineMessage>}
    </span>
  );
};

interface RecipeRowProps {
  recipe: RecipeSummary;
  isEntering: boolean;
  onEnter: () => void;
  onChanged: () => void;
}

const RecipeRow = ({ recipe, isEntering, onEnter, onChanged }: RecipeRowProps) => {
  const [isRenaming, setIsRenaming] = useState(false);

  if (isRenaming) {
    return <RenameEditor recipe={recipe} onDone={() => setIsRenaming(false)} onRenamed={onChanged} />;
  }

  return (
    <div className="flex flex-col gap-1">
      <button type="button" className={RECIPE_ROW_CLASS} disabled={isEntering} onClick={onEnter}>
        <span className="text-sm font-medium text-text">{withAiEstimateTag(recipe.name, recipe.isAiEstimate)}</span>
        <span className="tabular-nums text-xs text-text-muted">{macroLine(recipe)}</span>
      </button>
      <div className="flex gap-2 px-1 pb-2">
        <Button variant="ghost" link aria-label={`Rename ${recipe.name}`} onClick={() => setIsRenaming(true)}>
          Rename
        </Button>
        <DeleteControl recipe={recipe} onDeleted={onChanged} />
      </div>
    </div>
  );
};

const RECIPE_SKELETON_ROWS = 3;

const PickerSkeleton = () => (
  <div className="flex flex-col gap-4">
    {Array.from({ length: RECIPE_SKELETON_ROWS }, (_, index) => (
      <div key={`recipe-skeleton-${index}`} className="flex flex-col gap-2">
        <Skeleton className="h-4 w-40" />
        <Skeleton className="h-3 w-52" />
      </div>
    ))}
  </div>
);

const NO_RECIPES_LEFT_MESSAGE = "No recipes left — save a meal as a recipe to see it here again.";
const ADD_FAILED_MESSAGE = "Couldn't add it. Try again.";

interface RecipePickStepProps {
  mealId: string;
  recipes: RecipeSummary[];
  isLoading: boolean;
  onRecipesChanged: () => void;
  onEntered: () => void;
  dispatch: (action: PathAction) => void;
}

// The picker cannot be *entered* empty - the row that opens it stays greyed
// out until a recipe exists. It can still empty out while open, though:
// deleting the last recipe from in here refetches to an empty list, which
// the branch below states rather than rendering nothing under the heading.
export const RecipePickStep = ({ mealId, recipes, isLoading, onRecipesChanged, onEntered, dispatch }: RecipePickStepProps) => {
  const [enteringId, setEnteringId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const enter = async (recipeId: string) => {
    setEnteringId(recipeId);
    setError(null);
    try {
      const result = await enterRecipe(mealId, recipeId);
      if (result.kind === "entered") {
        onEntered();
        return;
      }
      setError(result.kind === "recipe_missing" ? "That recipe is gone. Your meal is unchanged." : ADD_FAILED_MESSAGE);
      onRecipesChanged();
    } catch {
      setError(ADD_FAILED_MESSAGE);
    } finally {
      setEnteringId(null);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-lg font-semibold">Your recipes</h2>
      {isLoading ? (
        <PickerSkeleton />
      ) : recipes.length === 0 ? (
        <p className="text-sm text-text-muted">{NO_RECIPES_LEFT_MESSAGE}</p>
      ) : (
        <div className="flex flex-col divide-y divide-border">
          {recipes.map((recipe) => (
            <RecipeRow
              key={recipe.id}
              recipe={recipe}
              isEntering={enteringId !== null}
              onEnter={() => void enter(recipe.id)}
              onChanged={onRecipesChanged}
            />
          ))}
        </div>
      )}
      {error && <InlineMessage tone="error">{error}</InlineMessage>}
      <Button variant="ghost" link onClick={() => dispatch({ type: "BACK" })}>
        {BACK_TO_OPTIONS_LABEL}
      </Button>
    </div>
  );
};
