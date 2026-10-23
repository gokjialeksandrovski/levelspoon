"use client";

import { XIcon } from "@phosphor-icons/react";
import { useState } from "react";

import type { MealIngredientDetail } from "@/features/meals/actions/meals";
import { earlierMealsFromRecipe, saveRecipeEdit, type SaveRecipeEditMode, type SaveRecipeEditResult } from "@/features/recipes/actions/recipes";
import {
  divergedMeals,
  divergedSentence,
  draftIsSaveable,
  draftKcal,
  draftRowToAmountRow,
  earlierMealsTickLabel,
  isValidRecipeName,
  RECIPE_NAME_MAX_LENGTH,
  recipeNameError,
  recipeNameHint,
  kcalPerUnit,
  offerableMeals,
  type DraftRow,
  type EarlierMeal,
} from "@/features/recipes/actions/recipes.utils";
import { Button } from "@/components/ui/button";
import { CheckboxRow } from "@/components/ui/checkbox-row";
import { Field, FigureField } from "@/components/ui/field";
import { InlineMessage } from "@/components/ui/inline-message";
import { Sheet } from "@/components/ui/sheet";
import { ICON_TAP_TARGET_CLASS } from "@/components/ui/tap-target";

const EMPTY_DRAFT_HINT = "A recipe needs at least one ingredient.";
// Distinct from EMPTY_DRAFT_HINT: a row can be sitting right there on screen
// with a blank or zero amount, which is not the same problem as no rows at
// all and shouldn't tell the user to add an ingredient they already added.
const INVALID_AMOUNT_HINT = "Give every ingredient an amount above zero.";

const FAILURE_COPY: Record<Exclude<SaveRecipeEditResult["kind"], "saved" | "meal_missing">, string> = {
  invalid_name: "Give the new recipe a name.",
  empty_draft: EMPTY_DRAFT_HINT,
  recipe_missing: "That recipe is gone. Your meal is unchanged.",
  failed: "Couldn't save. Try again.",
};

const toDraftRow = (ingredient: MealIngredientDetail): DraftRow => ({
  mealIngredientId: ingredient.id,
  productId: ingredient.productId,
  productName: ingredient.productName,
  quantity: String(ingredient.quantity),
  initialQuantity: String(ingredient.quantity),
  quantityUnit: ingredient.quantityUnit,
  entryCount: ingredient.entryCount,
  entryUnit: ingredient.entryUnit,
  quantitySource: ingredient.quantitySource,
  // Priced from the figures the page already holds, so a retyped amount costs
  // no round trip.
  kcalPerUnit: kcalPerUnit(ingredient.contribution.energyKcal, ingredient.quantity),
});

interface AmountPaneProps {
  rows: DraftRow[];
  isLoadingFork: boolean;
  onChange: (rows: DraftRow[]) => void;
  onContinue: () => void;
  onCancel: () => void;
}

interface DraftRowFieldProps {
  row: DraftRow;
  onQuantity: (text: string) => void;
  onRemove: () => void;
}

// Same row as lazy-track's review table: name and kcal on the left, the amount
// in a figure-sized box with its unit inside, remove as a 44px icon control.
// X, not a trash can: removing a row only edits the draft, nothing is deleted.
const DraftRowField = ({ row, onQuantity, onRemove }: DraftRowFieldProps) => (
  <FigureField
    label={
      <>
        {row.productName}
        <span className="sr-only"> amount</span>
      </>
    }
    name={`draft-${row.mealIngredientId}`}
    unit={row.quantityUnit}
    // Holds the raw typed text, not a parsed number - see DraftRow.
    // Round-tripping through Number() on every keystroke would
    // collapse "2." back to "2" before the next digit could land.
    value={row.quantity}
    onChange={(event) => onQuantity(event.target.value)}
    detail={`About ${Math.round(draftKcal([row]))} kcal`}
    action={
      <button type="button" aria-label={`Remove ${row.productName}`} onClick={onRemove} className={`${ICON_TAP_TARGET_CLASS} -mr-2.5 text-text-muted`}>
        <XIcon weight="regular" />
      </button>
    }
  />
);

// Pane one drafts the OPEN MEAL's rows, because overwriting files what the
// meal now is. Local state only - nothing is written until Save on pane two.
// The button stays enabled; an unsaveable draft is refused by EditRecipeSheet's
// toFork, with the reason already sitting above the button.
const AmountPane = ({ rows, isLoadingFork, onChange, onContinue, onCancel }: AmountPaneProps) => (
  <div className="flex flex-col gap-4">
    <div className="flex flex-col divide-y divide-border">
      {rows.map((row, index) => (
        <DraftRowField
          key={row.mealIngredientId}
          row={row}
          onQuantity={(text) => onChange(rows.map((current, position) => (position === index ? { ...current, quantity: text } : current)))}
          onRemove={() => onChange(rows.filter((_, position) => position !== index))}
        />
      ))}
    </div>
    {!draftIsSaveable(rows) && (
      <InlineMessage tone="warning">{rows.length === 0 ? EMPTY_DRAFT_HINT : INVALID_AMOUNT_HINT}</InlineMessage>
    )}
    <div className="flex gap-2">
      <Button className="flex-1" pending={isLoadingFork} onClick={onContinue}>
        Choose how to save
      </Button>
      <Button variant="ghost" className="flex-1" onClick={onCancel}>
        Cancel
      </Button>
    </div>
  </div>
);

interface EarlierMealsBlockProps {
  earlier: EarlierMeal[];
  draftTotalKcal: number;
  isTicked: boolean;
  onTick: (ticked: boolean) => void;
}

// Folds in under the overwrite option rather than stacking as a third screen.
// Renders nothing at all when today has no earlier meals from this recipe.
const EarlierMealsBlock = ({ earlier, draftTotalKcal, isTicked, onTick }: EarlierMealsBlockProps) => {
  const offerable = offerableMeals(earlier);
  const tickLabel = earlierMealsTickLabel(offerable, draftTotalKcal);
  const skipped = divergedSentence(divergedMeals(earlier));
  if (!tickLabel && !skipped) {
    return null;
  }
  return (
    <div className="ml-6 flex flex-col gap-2">
      {tickLabel && <CheckboxRow name="also-update-earlier-meals" label={tickLabel} checked={isTicked} onChange={onTick} />}
      {skipped && <InlineMessage tone="info">{skipped}</InlineMessage>}
    </div>
  );
};

type ForkChoice = "new" | "overwrite";

interface ForkPaneProps {
  recipeName: string;
  earlier: EarlierMeal[];
  draftTotalKcal: number;
  error: string | null;
  isSaving: boolean;
  onSave: (mode: SaveRecipeEditMode) => void;
  onBack: () => void;
  onCancel: () => void;
}

const ForkPane = ({ recipeName, earlier, draftTotalKcal, error, isSaving, onSave, onBack, onCancel }: ForkPaneProps) => {
  const [choice, setChoice] = useState<ForkChoice>("overwrite");
  const [newName, setNewName] = useState("");
  const [isTicked, setIsTicked] = useState(false);
  const [nameError, setNameError] = useState<string | undefined>(undefined);

  const submit = () => {
    if (choice === "new" && !isValidRecipeName(newName)) {
      setNameError(recipeNameError(newName));
      return;
    }
    onSave(
      choice === "new"
        ? { kind: "new", name: newName }
        : { kind: "overwrite", alsoUpdateMealIds: isTicked ? offerableMeals(earlier).map((meal) => meal.mealId) : [] },
    );
  };

  return (
    <div className="flex flex-col gap-4">
      <fieldset className="flex flex-col gap-3">
        <legend className="sr-only">What to save</legend>
        <label className="flex items-start gap-2 text-sm text-text">
          <input type="radio" name="recipe-save-mode" value="new" checked={choice === "new"} onChange={() => setChoice("new")} className="mt-1" />
          <span>Save as a new recipe</span>
        </label>
        {choice === "new" && (
          <div className="ml-6">
            <Field
              label="New recipe name"
              name="new-recipe-name"
              value={newName}
              onChange={(event) => {
                setNewName(event.target.value);
                setNameError(undefined);
              }}
              maxLength={RECIPE_NAME_MAX_LENGTH}
              helperText={recipeNameHint(newName)}
              error={nameError}
              autoFocus
            />
          </div>
        )}
        <label className="flex items-start gap-2 text-sm text-text">
          <input type="radio" name="recipe-save-mode" value="overwrite" checked={choice === "overwrite"} onChange={() => setChoice("overwrite")} className="mt-1" />
          <span className="min-w-0 wrap-anywhere">Overwrite &ldquo;{recipeName}&rdquo;</span>
        </label>
        {choice === "overwrite" && (
          <EarlierMealsBlock earlier={earlier} draftTotalKcal={draftTotalKcal} isTicked={isTicked} onTick={setIsTicked} />
        )}
      </fieldset>
      {error && <InlineMessage tone="error">{error}</InlineMessage>}
      <div className="flex gap-2">
        <Button variant="ghost" className="flex-1" onClick={onBack}>
          Back
        </Button>
        <Button className="flex-1" pending={isSaving} onClick={submit}>
          Save
        </Button>
        <Button variant="ghost" className="flex-1" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  );
};

const savedAnnouncement = (result: Extract<SaveRecipeEditResult, { kind: "saved" }>): string => {
  const updated = result.updatedMealNumbers.length > 0 ? ` Meal ${result.updatedMealNumbers.join(", Meal ")} updated too.` : "";
  const skipped =
    result.skippedMealNumbers.length > 0
      ? ` Meal ${result.skippedMealNumbers.join(", Meal ")} changed while you were editing, so it was left as it is.`
      : "";
  return `Recipe saved.${updated}${skipped}`;
};

interface EditRecipeSheetProps {
  mealId: string;
  recipeName: string;
  ingredients: MealIngredientDetail[];
  open: boolean;
  onClose: () => void;
  onSaved: (message: string) => void;
}

export const EditRecipeSheet = ({ mealId, recipeName, ingredients, open, onClose, onSaved }: EditRecipeSheetProps) => {
  const [rows, setRows] = useState<DraftRow[]>(() => ingredients.map(toDraftRow));
  const [pane, setPane] = useState<"amounts" | "fork">("amounts");
  const [earlier, setEarlier] = useState<EarlierMeal[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isLoadingFork, setIsLoadingFork] = useState(false);
  // Both actions below need it to tell the open meal's day from the user's
  // actual today, never the server's.
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;

  // Cancel drops the draft; it does not re-fetch to undo it, and it never
  // fires the mutation. Reopening rebuilds from the meal's own rows.
  const close = () => {
    setRows(ingredients.map(toDraftRow));
    setPane("amounts");
    setError(null);
    onClose();
  };

  const toFork = async () => {
    if (!draftIsSaveable(rows) || isLoadingFork) return;
    setError(null);
    setIsLoadingFork(true);
    try {
      setEarlier(await earlierMealsFromRecipe(mealId, timezone));
    } catch {
      // The fork still works without it - the tick simply does not render,
      // which is the same thing a user with no earlier meals sees.
      setEarlier([]);
    } finally {
      setIsLoadingFork(false);
    }
    setPane("fork");
  };

  const save = async (mode: SaveRecipeEditMode) => {
    setIsSaving(true);
    setError(null);
    try {
      const result = await saveRecipeEdit(mealId, rows.map(draftRowToAmountRow), mode, timezone);
      if (result.kind === "saved") {
        onSaved(savedAnnouncement(result));
        close();
        return;
      }
      // Same call the save sheet makes: a meal deleted under this sheet is not
      // an error to read inside it (spec §9).
      if (result.kind === "meal_missing") {
        close();
        return;
      }
      setError(FAILURE_COPY[result.kind]);
    } catch {
      setError(FAILURE_COPY.failed);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Sheet open={open} onClose={close} title="Edit this recipe">
      {/* Same reason save-recipe-sheet.tsx gates on `open`: Sheet keeps its
       * <dialog> mounted for the close transition, but a closed dialog's
       * children stay in the DOM (only `display` changes), so gating here is
       * what keeps a cancelled draft unfindable by label after close. */}
      {open &&
        (pane === "amounts" ? (
          <AmountPane rows={rows} isLoadingFork={isLoadingFork} onChange={setRows} onContinue={() => void toFork()} onCancel={close} />
        ) : (
          <ForkPane
            recipeName={recipeName}
            earlier={earlier}
            draftTotalKcal={draftKcal(rows)}
            error={error}
            isSaving={isSaving}
            onSave={(mode) => void save(mode)}
            onBack={() => setPane("amounts")}
            onCancel={close}
          />
        ))}
    </Sheet>
  );
};
