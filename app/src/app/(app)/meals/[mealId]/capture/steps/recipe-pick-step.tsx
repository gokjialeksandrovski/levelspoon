"use client";

import { PencilSimpleIcon, TrashIcon } from "@phosphor-icons/react";
import { useState } from "react";

import { deleteRecipe, enterRecipe, renameRecipe } from "@/features/recipes/actions/recipes";
import type { RecipeSummary } from "@/features/recipes/actions/recipes.store";
import { isValidRecipeName, RECIPE_NAME_MAX_LENGTH, recipeMatchesQuery, recipeNameHint } from "@/features/recipes/actions/recipes.utils";
import { withAiEstimateTag } from "@/features/lazy-track/actions/lazy-track.utils";
import { MacroLine } from "@/features/meals/components/macro-line";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { InlineMessage } from "@/components/ui/inline-message";
import { Skeleton } from "@/components/ui/skeleton";
import { FOCUS_RING } from "@/components/ui/tap-target";

// A full-width list row, structurally the same shape as the entry options -
// not a CTA, so it stays a raw button (CLAUDE.md, "App conventions").
// Two lines on a grid: name and kcal on the first, macros under the name on
// the second. The second line's right cell is left empty on purpose - the
// row icons sit over it, away from the kcal figure they used to crowd.
const RECIPE_ROW_CLASS = `grid w-full cursor-pointer grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-4 gap-y-1 px-1 py-3 text-left transition-colors hover:bg-surface-raised active:bg-surface-raised disabled:opacity-50 ${FOCUS_RING}`;

// Escape is the keyboard half of the exit for the inline row modes below
// (Rule 21). None is overlay-shaped, so there is no backdrop to pair it
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
      <Field
        label="Recipe name"
        name={`rename-${recipe.id}`}
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        maxLength={RECIPE_NAME_MAX_LENGTH}
        helperText={recipeNameHint(draft)}
        autoFocus
      />
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

// 18px, a notch under the 22px header icons: these act on one row and sit
// beside text-sm figures, and it is the size delete-meal's trash already uses.
// The 44px hit box stays; only the glyph shrinks.
const ROW_ICON_SIZE = 18;

// 36px wide, full 44px tall: two 44px squares side by side left 26px of air
// between the glyphs and read as two unrelated buttons. 36 brings that to
// 18px, so the pair reads as one group. Below the 44px floor on width only,
// still past WCAG 2.5.8's 24px; a stray tap on the trash only arms it, so a
// miss costs nothing.
const ROW_ICON_BOX = "h-11 w-9";

// The glyph floats (36-18)/2 = 9px inside its box; offsetting the group by
// that puts the trash on the content column's right edge.
const ROW_ICON_EDGE_PULL_RIGHT = "-right-[9px]";

const ROW_ICON_CLASS = `flex ${ROW_ICON_BOX} shrink-0 items-center justify-center text-text-muted transition-colors hover:bg-surface-raised hover:text-text disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-transparent ${FOCUS_RING}`;

interface RowIconsProps {
  recipe: RecipeSummary;
  isArmed: boolean;
  disabled: boolean;
  onRename: () => void;
  onToggleArmed: () => void;
}

// Icon-only, deliberately (CLAUDE.md, "App conventions"): two text links under
// every row doubled its height and out-shouted the one thing this screen is
// for, picking. The trash turns `danger` only while armed - the row's one
// coloured control, and only while it is live, same as the weight goal's.
// Laid over the row's empty bottom-right cell, on the macro line: a wrapping
// name grows the row upward from that line, so the icons stay beside the
// macros however many lines the name takes. -bottom-0.5 centres the 44px-tall
// box on that line (py-3 + half of text-xs's 16px line = 20px up; the box's
// own centre sits at 22px). Siblings of the row button, not children - a
// button inside a button is invalid HTML.
const RowIcons = ({ recipe, isArmed, disabled, onRename, onToggleArmed }: RowIconsProps) => (
  <span className={`absolute -bottom-0.5 flex items-center ${ROW_ICON_EDGE_PULL_RIGHT}`}>
    <button type="button" aria-label={`Rename ${recipe.name}`} disabled={disabled} onClick={onRename} className={ROW_ICON_CLASS}>
      <PencilSimpleIcon size={ROW_ICON_SIZE} weight="regular" />
    </button>
    <button
      type="button"
      aria-label={`Delete ${recipe.name}`}
      aria-pressed={isArmed}
      disabled={disabled}
      onClick={onToggleArmed}
      className={`${ROW_ICON_CLASS} aria-pressed:bg-danger/10 aria-pressed:text-danger`}
    >
      <TrashIcon size={ROW_ICON_SIZE} weight={isArmed ? "fill" : "regular"} />
    </button>
  </span>
);

interface DeleteConfirmProps {
  recipe: RecipeSummary;
  onKeep: () => void;
  onDeleted: () => void;
}

const DELETE_FAILED_MESSAGE = "Couldn't delete it. Try again.";
const DELETE_PROMPT = "Delete this recipe? Meals already logged keep their food.";

// Arming fires no request, and focus lands on Keep it so a stray Enter takes
// the non-destructive answer (Rule 21).
const DeleteConfirm = ({ recipe, onKeep, onDeleted }: DeleteConfirmProps) => {
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const remove = async () => {
    setIsDeleting(true);
    setError(null);
    try {
      await deleteRecipe(recipe.id);
      onDeleted();
    } catch {
      setError(DELETE_FAILED_MESSAGE);
      setIsDeleting(false);
    }
  };

  return (
    <div className="flex flex-col gap-3 px-1 pb-3">
      <p className="text-sm text-text-muted">{DELETE_PROMPT}</p>
      {error && <InlineMessage tone="error">{error}</InlineMessage>}
      <div className="flex gap-2">
        <Button variant="danger" className="flex-1" pending={isDeleting} onClick={() => void remove()}>
          Delete for good
        </Button>
        <Button variant="ghost" className="flex-1" disabled={isDeleting} onClick={onKeep} autoFocus>
          Keep it
        </Button>
      </div>
    </div>
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
  const [isArmed, setIsArmed] = useState(false);

  if (isRenaming) {
    return <RenameEditor recipe={recipe} onDone={() => setIsRenaming(false)} onRenamed={onChanged} />;
  }

  return (
    <div className="flex flex-col" onKeyDown={isArmed ? handleEscape(() => setIsArmed(false)) : undefined}>
      <div className="relative">
        <button type="button" className={RECIPE_ROW_CLASS} disabled={isEntering || isArmed} onClick={onEnter}>
          <span className="font-medium text-text wrap-anywhere">{withAiEstimateTag(recipe.name, recipe.isAiEstimate)}</span>
          {/* min-w-16 keeps the kcal column at least as wide as the icon pair
              below it, so a short figure ("85 kcal") never lets the macro line
              run under the icons. */}
          <span className="min-w-16 text-right tabular-nums text-sm text-text-muted">{Math.round(recipe.total.energyKcal)} kcal</span>
          <MacroLine contribution={recipe.total} />
        </button>
        <RowIcons
          recipe={recipe}
          isArmed={isArmed}
          disabled={isEntering}
          onRename={() => setIsRenaming(true)}
          onToggleArmed={() => setIsArmed((armed) => !armed)}
        />
      </div>
      {isArmed && <DeleteConfirm recipe={recipe} onKeep={() => setIsArmed(false)} onDeleted={onChanged} />}
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

const NO_RECIPES_LEFT_MESSAGE = "No recipes left. Save a meal as a recipe to see it here again.";
const PICKER_HINT = "Tap a recipe to add everything in it to this meal.";

const noMatchMessage = (query: string): string => `No recipe matches "${query.trim()}".`;

interface RecipeListProps {
  recipes: RecipeSummary[];
  query: string;
  enteringId: string | null;
  onEnter: (recipeId: string) => void;
  onChanged: () => void;
}

const RecipeList = ({ recipes, query, enteringId, onEnter, onChanged }: RecipeListProps) => {
  const matches = recipes.filter((recipe) => recipeMatchesQuery(recipe.name, query));
  if (matches.length === 0) {
    return <p className="text-sm text-text-muted">{noMatchMessage(query)}</p>;
  }
  return (
    <div className="flex flex-col divide-y divide-border">
      {matches.map((recipe) => (
        <RecipeRow
          key={recipe.id}
          recipe={recipe}
          isEntering={enteringId !== null}
          onEnter={() => onEnter(recipe.id)}
          onChanged={onChanged}
        />
      ))}
    </div>
  );
};

interface RecipePickerBodyProps extends Omit<RecipeListProps, "query"> {
  isLoading: boolean;
}

// The list is already in hand (useRecipes loads it before the picker opens),
// so search filters it as the user types - no button, no request.
const RecipePickerBody = ({ recipes, isLoading, ...list }: RecipePickerBodyProps) => {
  const [query, setQuery] = useState("");

  if (isLoading) {
    return <PickerSkeleton />;
  }
  if (recipes.length === 0) {
    return <p className="text-sm text-text-muted">{NO_RECIPES_LEFT_MESSAGE}</p>;
  }
  return (
    <div className="flex flex-col gap-4">
      <Field label="Search your recipes" name="recipe-search" value={query} onChange={(event) => setQuery(event.target.value)} />
      <RecipeList recipes={recipes} query={query} {...list} />
    </div>
  );
};
const ADD_FAILED_MESSAGE = "Couldn't add it. Try again.";

interface RecipePickStepProps {
  mealId: string;
  recipes: RecipeSummary[];
  isLoading: boolean;
  onRecipesChanged: () => void;
  onEntered: () => void;
}

// The picker cannot be *entered* empty - the row that opens it stays greyed
// out until a recipe exists. It can still empty out while open, though:
// deleting the last recipe from in here refetches to an empty list, which
// the branch below states rather than rendering nothing under the heading.
export const RecipePickStep = ({ mealId, recipes, isLoading, onRecipesChanged, onEntered }: RecipePickStepProps) => {
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
      {/* The top bar already says "Your recipes"; this line says what a tap does. */}
      <p className="text-sm text-text-muted">{PICKER_HINT}</p>
      <RecipePickerBody
        recipes={recipes}
        isLoading={isLoading}
        enteringId={enteringId}
        onEnter={(recipeId) => void enter(recipeId)}
        onChanged={onRecipesChanged}
      />
      {error && <InlineMessage tone="error">{error}</InlineMessage>}
    </div>
  );
};
