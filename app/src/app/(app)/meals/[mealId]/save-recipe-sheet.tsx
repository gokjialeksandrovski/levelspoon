"use client";

import { useState } from "react";

import { saveMealAsRecipe, type SaveRecipeResult } from "@/features/recipes/actions/recipes";
import { isValidRecipeName, RECIPE_NAME_MAX_LENGTH, recipeNameError, recipeNameHint } from "@/features/recipes/actions/recipes.utils";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { InlineMessage } from "@/components/ui/inline-message";
import { Sheet } from "@/components/ui/sheet";

// Stated here and only here. Repeating it on the picker every visit is how a
// list stops being scannable - the same call ALREADY_ADDED_HINT makes.
const PRIVACY_LINE = "Saved to your account only. No one else can see your recipes.";

const FAILURE_COPY: Record<Exclude<SaveRecipeResult["kind"], "saved" | "meal_missing">, string> = {
  invalid_name: "Give the recipe a name.",
  empty_meal: "Add an ingredient before saving this as a recipe.",
  failed: "Couldn't save. Try again.",
};

interface SaveRecipeSheetProps {
  mealId: string;
  open: boolean;
  onClose: () => void;
  onSaved: (name: string) => void;
}

export const SaveRecipeSheet = ({ mealId, open, onClose, onSaved }: SaveRecipeSheetProps) => {
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  // Cancel drops the draft rather than re-fetching to undo it: a user who
  // opened this out of curiosity generates no network traffic at all.
  const close = () => {
    setName("");
    setError(null);
    onClose();
  };

  const save = async () => {
    if (!isValidRecipeName(name)) {
      setError(recipeNameError(name));
      return;
    }
    setIsSaving(true);
    setError(null);
    try {
      const result = await saveMealAsRecipe(mealId, name);
      if (result.kind === "saved") {
        setName("");
        onSaved(result.name);
        onClose();
        return;
      }
      // A meal soft-deleted in another tab is not an error to read inside a
      // sheet about it: close, and the action's refresh shows not-found.
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
    <Sheet open={open} onClose={close} title="Save as a recipe">
      {/* Sheet keeps its own <dialog> mounted for the close transition, but the
       * form itself unmounts with `open` rather than sitting inertly behind a
       * closed dialog - a closed dialog's children stay in the DOM (only its
       * `display` changes), so a field left mounted there is still findable by
       * name. Unmounting is also what makes `autoFocus` re-fire on every open,
       * not just the first mount. */}
      {open && (
        <div className="flex flex-col gap-4">
          <Field
            label="Name"
            name="recipe-name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            maxLength={RECIPE_NAME_MAX_LENGTH}
            helperText={recipeNameHint(name)}
            autoFocus
          />
          <InlineMessage tone="info">{PRIVACY_LINE}</InlineMessage>
          {error && <InlineMessage tone="error">{error}</InlineMessage>}
          <div className="flex gap-2">
            <Button className="flex-1" pending={isSaving} onClick={() => void save()}>
              Save
            </Button>
            <Button variant="ghost" className="flex-1" onClick={close}>
              Cancel
            </Button>
          </div>
        </div>
      )}
    </Sheet>
  );
};
