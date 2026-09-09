// app/src/app/meals/[mealId]/ingredient-row.tsx
"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { removeMealIngredient, updateMealIngredientQuantity } from "@/actions/meals";
import type { MealIngredientDetail } from "@/actions/meals";
import { Button } from "@/components/button";
import { Field } from "@/components/field";
import { InlineMessage } from "@/components/inline-message";
import { Sheet } from "@/components/sheet";

interface MutationCallbacks {
  router: ReturnType<typeof useRouter>;
  onBusyChange: (isBusy: boolean) => void;
  onError: (message: string) => void;
  // Beside router.refresh() (a no-op once the parent page is a Client
  // Component with no server data of its own to refetch - see meal-detail.tsx),
  // this is what actually makes the parent's fetched ingredient list and
  // DayTotalBar pick up the change.
  onChanged?: () => void;
}

// Confirmation lives in the caller now (a Sheet, opened from the row's
// "Remove" trigger) - this only performs the mutation itself, invoked from
// the sheet's own confirm button.
const removeIngredient = async (mealIngredientId: string, callbacks: MutationCallbacks): Promise<void> => {
  callbacks.onBusyChange(true);
  try {
    await removeMealIngredient(mealIngredientId);
    callbacks.router.refresh();
    callbacks.onChanged?.();
  } catch {
    callbacks.onError("Could not remove this ingredient. Please try again.");
    callbacks.onBusyChange(false);
  }
};

const saveIngredientQuantity = async (
  mealIngredientId: string,
  quantityG: number,
  onSaved: () => void,
  callbacks: MutationCallbacks,
): Promise<void> => {
  callbacks.onBusyChange(true);
  try {
    await updateMealIngredientQuantity(mealIngredientId, quantityG);
    onSaved();
    callbacks.router.refresh();
    callbacks.onChanged?.();
  } catch {
    callbacks.onError("Could not update this ingredient. Please try again.");
  } finally {
    callbacks.onBusyChange(false);
  }
};

interface UseIngredientEditingResult {
  isEditing: boolean;
  quantityInput: string;
  isBusy: boolean;
  error: string | null;
  startEditing: () => void;
  setQuantityInput: (value: string) => void;
  saveQuantity: () => Promise<void>;
  remove: () => Promise<void>;
  clearError: () => void;
}

const useIngredientEditing = (ingredient: MealIngredientDetail, onChanged?: () => void): UseIngredientEditingResult => {
  const router = useRouter();
  const [isEditing, setIsEditing] = useState(false);
  const [quantityInput, setQuantityInput] = useState(String(ingredient.quantityG));
  const [error, setError] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const callbacks: MutationCallbacks = { router, onBusyChange: setIsBusy, onError: setError, onChanged };

  return {
    isEditing,
    quantityInput,
    isBusy,
    error,
    startEditing: () => setIsEditing(true),
    setQuantityInput,
    saveQuantity: () => saveIngredientQuantity(ingredient.id, Number(quantityInput), () => setIsEditing(false), callbacks),
    remove: () => removeIngredient(ingredient.id, callbacks),
    clearError: () => setError(null),
  };
};

interface IngredientHeaderProps {
  productName: string;
  quantitySource: "ai_estimated" | "manual";
}

const IngredientHeader = ({ productName, quantitySource }: IngredientHeaderProps) => (
  <div className="flex items-center justify-between">
    <span className="font-medium text-text">{productName}</span>
    <span className="text-sm text-text-muted">{quantitySource === "manual" ? "manual" : "estimated"}</span>
  </div>
);

interface QuantityEditorProps {
  ingredientId: string;
  quantityInput: string;
  isBusy: boolean;
  onChange: (value: string) => void;
  onSave: () => void;
}

const QuantityEditor = ({ ingredientId, quantityInput, isBusy, onChange, onSave }: QuantityEditorProps) => (
  <div className="flex items-end gap-2">
    <div className="flex-1">
      <Field
        label="Amount (g)"
        name={`quantity-${ingredientId}`}
        type="number"
        inputMode="decimal"
        value={quantityInput}
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
    <Button disabled={isBusy} onClick={onSave}>
      Save
    </Button>
  </div>
);

interface QuantitySummaryProps {
  quantityG: number;
  energyKcal: number;
  isBusy: boolean;
  onEdit: () => void;
  onRemove: () => void;
}

// Padding + a matching negative margin grows the tappable area (ui-ux-pro-max's
// touch-target-size: 44x44 minimum) without growing the row itself or the
// gap between the two buttons - the underline lives on a nested span, not the
// padded button, so it still hugs just the word rather than stretching under
// the extra padding (found via /critique, 2026-09-09).
const ACTION_HIT_AREA = "-my-2 -mx-1 px-1 py-2";

const QuantitySummary = ({ quantityG, energyKcal, isBusy, onEdit, onRemove }: QuantitySummaryProps) => (
  <div className="flex items-center justify-between text-sm text-text-muted">
    <span className="tabular-nums">
      {quantityG}g · {Math.round(energyKcal)} kcal
    </span>
    <div className="flex gap-3">
      <button type="button" onClick={onEdit} className={`${ACTION_HIT_AREA} text-text-muted`}>
        <span className="underline">Edit</span>
      </button>
      <button type="button" disabled={isBusy} onClick={onRemove} className={`${ACTION_HIT_AREA} text-danger disabled:opacity-50`}>
        <span className="underline">Remove</span>
      </button>
    </div>
  </div>
);

interface QuantityControlsProps {
  ingredient: MealIngredientDetail;
  editing: UseIngredientEditingResult;
  onRequestRemove: () => void;
}

const QuantityControls = ({ ingredient, editing, onRequestRemove }: QuantityControlsProps) =>
  editing.isEditing ? (
    <QuantityEditor
      ingredientId={ingredient.id}
      quantityInput={editing.quantityInput}
      isBusy={editing.isBusy}
      onChange={editing.setQuantityInput}
      onSave={editing.saveQuantity}
    />
  ) : (
    <QuantitySummary
      quantityG={ingredient.quantityG}
      energyKcal={ingredient.contribution.energyKcal}
      isBusy={editing.isBusy}
      onEdit={editing.startEditing}
      onRemove={onRequestRemove}
    />
  );

const CorrectionLink = ({ productId }: { productId: string }) => (
  <Link href={`/products/${productId}/correct`} className="text-xs text-text-muted underline">
    Values look wrong?
  </Link>
);

interface RemoveIngredientSheetProps {
  productName: string;
  isBusy: boolean;
  error: string | null;
  onClose: () => void;
  onConfirm: () => void;
}

// Mounted only while the confirm flow is actually open (see IngredientRow) -
// rendering one of these per row unconditionally would keep every row's
// product name in the DOM twice (once visible in IngredientHeader, once
// hidden in this Sheet's title), which throws off any test or screen reader
// query that counts occurrences of a product name across a meal's rows.
const RemoveIngredientSheet = ({ productName, isBusy, error, onClose, onConfirm }: RemoveIngredientSheetProps) => (
  <Sheet open onClose={onClose} title={`Remove ${productName}?`}>
    <div className="flex flex-col gap-4">
      <p className="text-sm text-text-muted">This takes it off the meal. This can&apos;t be undone.</p>
      {error && <InlineMessage tone="error">{error}</InlineMessage>}
      <Button variant="danger" disabled={isBusy} onClick={onConfirm}>
        Remove
      </Button>
    </div>
  </Sheet>
);

interface IngredientRowContentProps {
  ingredient: MealIngredientDetail;
  editing: UseIngredientEditingResult;
  onRequestRemove: () => void;
  showError: boolean;
}

const IngredientRowContent = ({ ingredient, editing, onRequestRemove, showError }: IngredientRowContentProps) => (
  <>
    <IngredientHeader productName={ingredient.productName} quantitySource={ingredient.quantitySource} />
    <QuantityControls ingredient={ingredient} editing={editing} onRequestRemove={onRequestRemove} />
    <CorrectionLink productId={ingredient.productId} />
    {showError && editing.error && <InlineMessage tone="error">{editing.error}</InlineMessage>}
  </>
);

interface IngredientRowProps {
  ingredient: MealIngredientDetail;
  onChanged?: () => void;
}

export const IngredientRow = ({ ingredient, onChanged }: IngredientRowProps) => {
  const editing = useIngredientEditing(ingredient, onChanged);
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const closeConfirmSheet = () => { setIsConfirmOpen(false); editing.clearError(); };

  return (
    <li className="flex flex-col gap-2 py-4">
      <IngredientRowContent ingredient={ingredient} editing={editing} onRequestRemove={() => setIsConfirmOpen(true)} showError={!isConfirmOpen} />
      {isConfirmOpen && (
        <RemoveIngredientSheet
          productName={ingredient.productName}
          isBusy={editing.isBusy}
          error={editing.error}
          onClose={closeConfirmSheet}
          onConfirm={editing.remove}
        />
      )}
    </li>
  );
};
