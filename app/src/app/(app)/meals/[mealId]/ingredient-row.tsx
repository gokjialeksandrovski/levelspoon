"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { removeMealIngredient, updateMealIngredientQuantity } from "@/features/meals/actions/meals";
import type { MealIngredientDetail } from "@/features/meals/actions/meals";
import { Button } from "@/components/ui/button";
import { InlineMessage } from "@/components/ui/inline-message";
import { Sheet } from "@/components/ui/sheet";
import { TAP_HIT_AREA_XS } from "@/components/ui/tap-target";
import { UnitAmountField } from "@/components/ui/unit-amount-field";
import { availableUnits } from "@/lib/measures/available-units";
import type { MeasureContext } from "@/lib/measures/resolve-grams";
import { resolveQuantity } from "@/lib/measures/resolve-quantity";

interface MutationCallbacks {
  router: ReturnType<typeof useRouter>;
  onBusyChange: (isBusy: boolean) => void;
  onError: (message: string | null) => void;
  // router.refresh() is a no-op here (parent is a Client Component); this is
  // what makes the ingredient list and DayTotalBar pick up the change.
  onChanged?: () => void;
}

// Confirmation lives in the caller's Sheet - this only performs the mutation.
const removeIngredient = async (mealIngredientId: string, callbacks: MutationCallbacks): Promise<void> => {
  callbacks.onBusyChange(true);
  try {
    await removeMealIngredient(mealIngredientId);
    callbacks.router.refresh();
    callbacks.onChanged?.();
  } catch {
    callbacks.onError("Couldn't remove this ingredient. Try again.");
    callbacks.onBusyChange(false);
  }
};

const saveIngredientQuantity = async (
  mealIngredientId: string,
  quantity: number,
  quantityUnit: string,
  onSaved: () => void,
  callbacks: MutationCallbacks,
): Promise<void> => {
  callbacks.onError(null);
  callbacks.onBusyChange(true);
  try {
    await updateMealIngredientQuantity(mealIngredientId, quantity, quantityUnit);
    onSaved();
    callbacks.router.refresh();
    callbacks.onChanged?.();
  } catch {
    callbacks.onError("Couldn't update this ingredient. Try again.");
  } finally {
    callbacks.onBusyChange(false);
  }
};

const contextFor = (ingredient: MealIngredientDetail): MeasureContext => ({
  productName: ingredient.productName,
  densityGMl: ingredient.densityGMl,
  servingUnit: ingredient.servingUnit,
  servingGrams: ingredient.servingGrams,
  nutritionBasisUnit: ingredient.nutritionBasisUnit,
});

interface ResolveAndSaveQuantityInput {
  ingredientId: string;
  count: string;
  unit: string;
  context: MeasureContext;
}

// Exported so ingredient-row.test.ts can call it directly.
export const resolveAndSaveQuantity = async (
  input: ResolveAndSaveQuantityInput,
  onSaved: () => void,
  callbacks: MutationCallbacks,
): Promise<void> => {
  const resolution = resolveQuantity(input.count, input.unit, input.context);
  if (resolution.kind === "unresolved") {
    callbacks.onError(`Couldn't work out the amount in "${input.unit}". Try a different unit.`);
    return;
  }
  await saveIngredientQuantity(input.ingredientId, resolution.quantity, resolution.quantityUnit, onSaved, callbacks);
};

interface UseIngredientEditingResult {
  isEditing: boolean;
  count: string;
  unit: string;
  units: string[];
  isBusy: boolean;
  error: string | null;
  startEditing: () => void;
  setCount: (value: string) => void;
  setUnit: (value: string) => void;
  saveQuantity: () => Promise<void>;
  remove: () => Promise<void>;
  clearError: () => void;
}

const buildQuantityActions = (
  ingredient: MealIngredientDetail,
  context: MeasureContext,
  count: string,
  unit: string,
  setIsEditing: (value: boolean) => void,
  setCount: (value: string) => void,
  setUnit: (value: string) => void,
  setError: (value: string | null) => void,
  callbacks: MutationCallbacks,
) => ({
  startEditing: () => setIsEditing(true),
  setCount,
  setUnit,
  saveQuantity: () =>
    resolveAndSaveQuantity({ ingredientId: ingredient.id, count, unit, context }, () => setIsEditing(false), callbacks),
  remove: () => removeIngredient(ingredient.id, callbacks),
  clearError: () => setError(null),
});

const useIngredientEditing = (ingredient: MealIngredientDetail, onChanged?: () => void): UseIngredientEditingResult => {
  const router = useRouter();
  const context = contextFor(ingredient);
  const [isEditing, setIsEditing] = useState(false);
  const [count, setCount] = useState(String(ingredient.quantity));
  const [unit, setUnit] = useState(ingredient.quantityUnit);
  const [error, setError] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const callbacks: MutationCallbacks = { router, onBusyChange: setIsBusy, onError: setError, onChanged };

  return {
    isEditing,
    count,
    unit,
    units: availableUnits(context),
    isBusy,
    error,
    ...buildQuantityActions(ingredient, context, count, unit, setIsEditing, setCount, setUnit, setError, callbacks),
  };
};

interface IngredientHeaderProps {
  productName: string;
  quantitySource: "ai_estimated" | "manual";
}

const IngredientHeader = ({ productName, quantitySource }: IngredientHeaderProps) => (
  <div className="flex items-center justify-between gap-2">
    <span className="truncate font-medium text-text">{productName}</span>
    <span className="shrink-0 text-sm text-text-muted">
      {quantitySource === "manual" ? "Manual entry" : "AI estimate"}
    </span>
  </div>
);

interface QuantityEditorProps {
  ingredientId: string;
  count: string;
  unit: string;
  units: string[];
  isBusy: boolean;
  onCountChange: (value: string) => void;
  onUnitChange: (value: string) => void;
  onSave: () => void;
}

const QuantityEditor = ({ ingredientId, count, unit, units, isBusy, onCountChange, onUnitChange, onSave }: QuantityEditorProps) => (
  <div className="flex items-end gap-2">
    <div className="flex-1">
      <UnitAmountField
        name={`quantity-${ingredientId}`}
        count={count}
        unit={unit}
        units={units}
        // Stops focus dropping on the now-unmounted "Edit" button.
        autoFocus
        onCountChange={onCountChange}
        onUnitChange={onUnitChange}
      />
    </div>
    <Button disabled={count.trim() === ""} pending={isBusy} onClick={onSave}>
      Save
    </Button>
  </div>
);

interface QuantitySummaryProps {
  productName: string;
  quantity: number;
  quantityUnit: string;
  energyKcal: number;
  isBusy: boolean;
  onEdit: () => void;
  onRemove: () => void;
}

interface RowActionProps {
  label: string;
  variant: "ghost" | "danger";
  disabled?: boolean;
  onClick: () => void;
  children: string;
}

// Visible text is the bare verb; `label` carries the product name so a
// screen reader can tell which row's action this is in a multi-ingredient meal.
const RowAction = ({ label, variant, disabled, onClick, children }: RowActionProps) => (
  <Button variant={variant} link disabled={disabled} aria-busy={disabled || undefined} onClick={onClick} aria-label={label}>
    {children}
  </Button>
);

// gap-5, not gap-3: each RowAction's hit box reaches 4px past its text
// (TAP_HIT_AREA_SM), so a tighter gap leaves targets under the 8px minimum.
const QuantitySummary = ({ productName, quantity, quantityUnit, energyKcal, isBusy, onEdit, onRemove }: QuantitySummaryProps) => (
  <div className="flex items-center justify-between text-sm text-text-muted">
    <span className="tabular-nums">
      {quantity} {quantityUnit} · {Math.round(energyKcal)} kcal
    </span>
    <div className="flex gap-5">
      <RowAction label={`Edit ${productName} amount`} variant="ghost" onClick={onEdit}>
        Edit
      </RowAction>
      <RowAction
        label={`Remove ${productName}`}
        variant="danger"
        disabled={isBusy}
        onClick={onRemove}
      >
        Remove
      </RowAction>
    </div>
  </div>
);

interface QuantityControlsProps {
  ingredient: MealIngredientDetail;
  editing: UseIngredientEditingResult;
  onRequestRemove: () => void;
}

type EditingControlsProps = Pick<QuantityControlsProps, "ingredient" | "editing">;

const EditingControls = ({ ingredient, editing }: EditingControlsProps) => (
  <QuantityEditor
    ingredientId={ingredient.id}
    count={editing.count}
    unit={editing.unit}
    units={editing.units}
    isBusy={editing.isBusy}
    onCountChange={editing.setCount}
    onUnitChange={editing.setUnit}
    onSave={editing.saveQuantity}
  />
);

const SummaryControls = ({ ingredient, editing, onRequestRemove }: QuantityControlsProps) => (
  <QuantitySummary
    productName={ingredient.productName}
    quantity={ingredient.quantity}
    quantityUnit={ingredient.quantityUnit}
    energyKcal={ingredient.contribution.energyKcal}
    isBusy={editing.isBusy}
    onEdit={editing.startEditing}
    onRemove={onRequestRemove}
  />
);

const QuantityControls = ({ ingredient, editing, onRequestRemove }: QuantityControlsProps) =>
  editing.isEditing ? (
    <EditingControls ingredient={ingredient} editing={editing} />
  ) : (
    <SummaryControls ingredient={ingredient} editing={editing} onRequestRemove={onRequestRemove} />
  );

// `block` is explicit: vertical margin is a no-op on inline elements, so
// TAP_HIT_AREA_XS's -my-3.5 would silently do nothing without it.
const CorrectionLink = ({ productId, productName }: { productId: string; productName: string }) => (
  <div className="mt-1">
    <Link
      href={`/products/${productId}/correct`}
      aria-label={`Correct values for ${productName}`}
      className={`${TAP_HIT_AREA_XS} block text-xs text-text-muted underline`}
    >
      <span>Values look wrong?</span>
    </Link>
  </div>
);

interface RemoveIngredientSheetProps {
  productName: string;
  isBusy: boolean;
  error: string | null;
  onClose: () => void;
  onConfirm: () => void;
}

// Mounted only while open - rendering unconditionally would duplicate the
// product name in the DOM, throwing off any query that counts occurrences.
const RemoveIngredientSheet = ({ productName, isBusy, error, onClose, onConfirm }: RemoveIngredientSheetProps) => (
  <Sheet open onClose={onClose} title={`Remove ${productName}?`}>
    <div className="flex flex-col gap-4">
      <p className="text-sm text-text-muted">This takes it off the meal. This can&apos;t be undone.</p>
      {error && <InlineMessage tone="error">{error}</InlineMessage>}
      <Button variant="danger" pending={isBusy} onClick={onConfirm}>
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
    <CorrectionLink productId={ingredient.productId} productName={ingredient.productName} />
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
