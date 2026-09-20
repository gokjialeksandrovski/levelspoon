"use client";

import { XIcon } from "@phosphor-icons/react";
import { motion, useReducedMotion } from "motion/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

import { removeMealIngredient, updateMealIngredientQuantity } from "@/features/meals/actions/meals";
import type { MealIngredientDetail } from "@/features/meals/actions/meals";
import { MacroLine } from "@/features/meals/components/macro-line";
import type { NutritionValues } from "@/types/nutrition";
import { Button } from "@/components/ui/button";
import { InlineMessage } from "@/components/ui/inline-message";
import { ICON_ROW_EDGE_PULL_RIGHT, ICON_TAP_TARGET_CLASS, TAP_HIT_AREA_XS } from "@/components/ui/tap-target";
import { UnitAmountField } from "@/components/ui/unit-amount-field";
import { availableUnits } from "@/lib/measures/available-units";
import type { MeasureContext } from "@/lib/measures/resolve-grams";
import { resolveQuantity } from "@/lib/measures/resolve-quantity";
import { rowEnterVariants } from "@/lib/motion/step-transition";

import { quantityText } from "./amount-chips.utils";

interface MutationCallbacks {
  router: ReturnType<typeof useRouter>;
  onBusyChange: (isBusy: boolean) => void;
  onError: (message: string | null) => void;
  // router.refresh() is a no-op here (parent is a Client Component); this is
  // what makes the ingredient list pick up the change.
  onChanged?: () => void;
  onRemoved?: () => void;
}

// No confirm step: removal is a soft delete, and the caller leaves an Undo in
// the row's place (RemovedIngredientRow).
const removeIngredient = async (mealIngredientId: string, callbacks: MutationCallbacks): Promise<void> => {
  callbacks.onBusyChange(true);
  callbacks.onError(null);
  try {
    await removeMealIngredient(mealIngredientId);
    callbacks.onRemoved?.();
    callbacks.router.refresh();
    callbacks.onChanged?.();
  } catch {
    callbacks.onError("Couldn't remove this ingredient. Try again.");
    callbacks.onBusyChange(false);
  }
};

interface ResolvedAmount {
  quantity: number;
  quantityUnit: string;
  entryCount: number;
  entryUnit: string;
}

const saveIngredientQuantity = async (
  mealIngredientId: string,
  amount: ResolvedAmount,
  onSaved: () => void,
  callbacks: MutationCallbacks,
): Promise<void> => {
  callbacks.onError(null);
  callbacks.onBusyChange(true);
  try {
    await updateMealIngredientQuantity(
      mealIngredientId,
      amount.quantity,
      amount.quantityUnit,
      amount.entryCount,
      amount.entryUnit,
    );
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
  portions: ingredient.portions,
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
  // An edit re-states the entry, so the echo is what was typed this time.
  await saveIngredientQuantity(
    input.ingredientId,
    { quantity: resolution.quantity, quantityUnit: resolution.quantityUnit, entryCount: Number(input.count), entryUnit: input.unit },
    onSaved,
    callbacks,
  );
};

interface UseIngredientEditingResult {
  isEditing: boolean;
  count: string;
  unit: string;
  units: string[];
  isBusy: boolean;
  error: string | null;
  startEditing: () => void;
  cancelEditing: () => void;
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
  setEditing: (value: boolean) => void,
  setCount: (value: string) => void,
  setUnit: (value: string) => void,
  setError: (value: string | null) => void,
  callbacks: MutationCallbacks,
) => ({
  startEditing: () => setEditing(true),
  setCount,
  setUnit,
  saveQuantity: () =>
    resolveAndSaveQuantity({ ingredientId: ingredient.id, count, unit, context }, () => setEditing(false), callbacks),
  remove: () => removeIngredient(ingredient.id, callbacks),
  clearError: () => setError(null),
});

/**
 * What the edit control opens on.
 *
 * A row logged as "1 slice" opens on 1 slice, not on the 28 g it resolved to -
 * otherwise correcting it means re-deriving the count the user already said.
 * Falls back to the stored quantity when the entry is missing (a row older
 * than these columns) or when its unit no longer resolves for this product,
 * which would leave the select unable to show its own value.
 */
export const editSeed = (
  ingredient: MealIngredientDetail,
  units: readonly string[],
): { count: string; unit: string } =>
  ingredient.entryCount !== null && ingredient.entryUnit !== null && units.includes(ingredient.entryUnit)
    ? { count: String(ingredient.entryCount), unit: ingredient.entryUnit }
    : { count: String(ingredient.quantity), unit: ingredient.quantityUnit };

interface DraftSetters {
  setIsEditing: (value: boolean) => void;
  setCount: (value: string) => void;
  setUnit: (value: string) => void;
  setError: (value: string | null) => void;
}

// Leaving edit mode restores the committed amount rather than keeping the
// abandoned draft, and issues no request - opening the editor out of
// curiosity must cost nothing.
const resetDraft = (setters: DraftSetters, seedCount: string, seedUnit: string): void => {
  setters.setIsEditing(false);
  setters.setCount(seedCount);
  setters.setUnit(seedUnit);
  setters.setError(null);
};

const useIngredientEditing = (ingredient: MealIngredientDetail, onChanged?: () => void, onRemoved?: () => void): UseIngredientEditingResult => {
  const router = useRouter();
  const context = contextFor(ingredient);
  const units = availableUnits(context);
  const { count: seedCount, unit: seedUnit } = editSeed(ingredient, units);
  const [isEditing, setIsEditing] = useState(false);
  const [count, setCount] = useState(seedCount);
  const [unit, setUnit] = useState(seedUnit);
  const [error, setError] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const callbacks: MutationCallbacks = { router, onBusyChange: setIsBusy, onError: setError, onChanged, onRemoved };

  // useState setters are referentially stable, so this memo only recomputes
  // once - giving the effect below a stable dependency (same reason as
  // confirm-step's `setters`).
  const setters = useMemo(() => ({ setIsEditing, setCount, setUnit, setError }), []);

  // Opening the editor pushes a history entry, so the device Back gesture and
  // the browser's Back button exit the editor instead of leaving the meal -
  // the same expectation any overlay sets. Every other way out spends that
  // entry again (history.back()), so Back is never wasted on a stale one.
  const setEditing = (value: boolean) => {
    if (value) window.history.pushState({ inlineEdit: true }, "");
    else window.history.back();
    setIsEditing(value);
  };

  useEffect(() => {
    if (!isEditing) return;
    const handlePop = () => resetDraft(setters, seedCount, seedUnit);
    window.addEventListener("popstate", handlePop);
    return () => window.removeEventListener("popstate", handlePop);
  }, [isEditing, setters, seedCount, seedUnit]);

  return {
    isEditing,
    cancelEditing: () => {
      resetDraft(setters, seedCount, seedUnit);
      window.history.back();
    },
    count,
    unit,
    units,
    isBusy,
    error,
    ...buildQuantityActions(ingredient, context, count, unit, setEditing, setCount, setUnit, setError, callbacks),
  };
};

// Normalizes an all-caps stored name for display only ("SNICKERS BAR" ->
// "Snickers Bar") so a shouty label doesn't clash with the warm-journal tone
// next to a naturally-cased one. Mixed-case names pass through untouched;
// the stored string itself is never rewritten.
const displayProductName = (name: string): string =>
  name === name.toUpperCase() && name !== name.toLowerCase()
    ? name.toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase())
    : name;

const IngredientHeader = ({ productName }: { productName: string }) => (
  <span className="block truncate font-medium text-text">{displayProductName(productName)}</span>
);

// Escape is the keyboard half of the exit; Back is the device half, and the
// in-field X (plus a tap outside) is the visible one.
const escapeHandler = (onCancel: () => void) => (event: React.KeyboardEvent) => {
  if (event.key === "Escape") onCancel();
};

interface QuantityEditorProps {
  ingredientId: string;
  cancelLabel: string;
  count: string;
  unit: string;
  units: string[];
  isBusy: boolean;
  onCountChange: (value: string) => void;
  onUnitChange: (value: string) => void;
  onSave: () => void;
  onCancel: () => void;
}

const QuantityEditor = ({ ingredientId, cancelLabel, count, unit, units, isBusy, onCountChange, onUnitChange, onSave, onCancel }: QuantityEditorProps) => {
  const rootRef = useRef<HTMLDivElement>(null);

  // Tapping anywhere outside the editor leaves it, the same way the X does.
  // pointerdown, not click: it fires before focus moves, so the editor is gone
  // by the time the tapped control takes over. The listener mounts with the
  // editor, so the click that opened it (whose pointerdown already fired)
  // cannot close it again.
  useEffect(() => {
    const handlePointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) onCancel();
    };
    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [onCancel]);

  return (
    <div ref={rootRef} className="flex items-end gap-2" onKeyDown={escapeHandler(onCancel)}>
      <div className="flex-1">
        <UnitAmountField
          name={`quantity-${ingredientId}`}
          count={count}
          unit={unit}
          units={units}
          // Stops focus dropping on the now-unmounted "Edit" button.
          autoFocus
          trailingAction={{ label: cancelLabel, onClick: onCancel, disabled: isBusy }}
          onCountChange={onCountChange}
          onUnitChange={onUnitChange}
        />
      </div>
      <Button disabled={count.trim() === ""} pending={isBusy} onClick={onSave}>
        Save
      </Button>
    </div>
  );
};

interface QuantitySummaryProps {
  productName: string;
  quantity: number;
  quantityUnit: string;
  entryCount: number | null;
  entryUnit: string | null;
  contribution: NutritionValues;
  quantitySource: MealIngredientDetail["quantitySource"];
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

// Only the AI-estimated case is worth flagging inline - it's the one whose
// value might be off and worth a second look. "manual" is the default/expected
// state for most rows, so it stays silent rather than repeating itself on
// every ingredient (heuristic: don't badge the common case).
const AMOUNT_SOURCE_NOTE: Record<MealIngredientDetail["quantitySource"], string | null> = {
  manual: null,
  ai_estimated: "AI-estimated amount",
};

interface QuantityLineProps {
  quantity: number;
  quantityUnit: string;
  entryCount: number | null;
  entryUnit: string | null;
  energyKcal: number;
  sourceNote: string | null;
}

const QuantityLine = ({ quantity, quantityUnit, entryCount, entryUnit, energyKcal, sourceNote }: QuantityLineProps) => (
  <span className="tabular-nums">
    {quantityText(quantity, quantityUnit, entryCount, entryUnit)} ·{" "}
    <span className="font-semibold">{Math.round(energyKcal)} kcal</span>
    {sourceNote && <span className="italic"> · {sourceNote}</span>}
  </span>
);

interface RowActionsGroupProps {
  productName: string;
  isBusy: boolean;
  onEdit: () => void;
  onRemove: () => void;
}

// gap-5, not gap-3: each RowAction's hit box reaches 4px past its text
// (TAP_HIT_AREA_SM), so a tighter gap leaves targets under the 8px minimum.
const RowActionsGroup = ({ productName, isBusy, onEdit, onRemove }: RowActionsGroupProps) => (
  <div className="flex gap-5">
    <RowAction label={`Edit ${productName} amount`} variant="ghost" onClick={onEdit}>
      Edit
    </RowAction>
    <RowAction label={`Remove ${productName}`} variant="danger" disabled={isBusy} onClick={onRemove}>
      Remove
    </RowAction>
  </div>
);

const QuantitySummary = ({ productName, quantity, quantityUnit, entryCount, entryUnit, contribution, quantitySource, isBusy, onEdit, onRemove }: QuantitySummaryProps) => (
  <div className="flex flex-col gap-1">
    <div className="flex items-center justify-between text-sm text-text-muted">
      <QuantityLine
        quantity={quantity}
        quantityUnit={quantityUnit}
        entryCount={entryCount}
        entryUnit={entryUnit}
        energyKcal={contribution.energyKcal}
        sourceNote={AMOUNT_SOURCE_NOTE[quantitySource]}
      />
      <RowActionsGroup productName={productName} isBusy={isBusy} onEdit={onEdit} onRemove={onRemove} />
    </div>
    <MacroLine contribution={contribution} />
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
    cancelLabel={`Cancel editing ${displayProductName(ingredient.productName)} amount`}
    count={editing.count}
    unit={editing.unit}
    units={editing.units}
    isBusy={editing.isBusy}
    onCountChange={editing.setCount}
    onUnitChange={editing.setUnit}
    onSave={editing.saveQuantity}
    onCancel={editing.cancelEditing}
  />
);

const SummaryControls = ({ ingredient, editing, onRequestRemove }: QuantityControlsProps) => (
  <QuantitySummary
    productName={displayProductName(ingredient.productName)}
    quantity={ingredient.quantity}
    quantityUnit={ingredient.quantityUnit}
    entryCount={ingredient.entryCount}
    entryUnit={ingredient.entryUnit}
    contribution={ingredient.contribution}
    quantitySource={ingredient.quantitySource}
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
      <span>Correct these values</span>
    </Link>
  </div>
);

interface IngredientRowContentProps {
  ingredient: MealIngredientDetail;
  editing: UseIngredientEditingResult;
  onRequestRemove: () => void;
}

const IngredientRowContent = ({ ingredient, editing, onRequestRemove }: IngredientRowContentProps) => (
  <>
    <IngredientHeader productName={ingredient.productName} />
    <QuantityControls ingredient={ingredient} editing={editing} onRequestRemove={onRequestRemove} />
    {/* Hidden while editing: it navigates away mid-edit, which is not an exit,
        and a row being edited is not the moment to offer it. */}
    {!editing.isEditing && (
      <CorrectionLink productId={ingredient.productId} productName={displayProductName(ingredient.productName)} />
    )}
    {editing.error && <InlineMessage tone="error">{editing.error}</InlineMessage>}
  </>
);

interface IngredientRowProps {
  ingredient: MealIngredientDetail;
  onChanged?: () => void;
  onRemoved: () => void;
}

// Exit fade + `layout` reflow so a removed row doesn't just vanish; the
// entrance rise is timed by the parent's stagger (meal-detail.tsx).
const rowExit = (reduceMotion: boolean | null) => (reduceMotion ? undefined : { opacity: 0 });

export const IngredientRow = ({ ingredient, onChanged, onRemoved }: IngredientRowProps) => {
  const editing = useIngredientEditing(ingredient, onChanged, onRemoved);
  const reduceMotion = useReducedMotion();

  return (
    <motion.li layout={!reduceMotion} variants={rowEnterVariants} exit={rowExit(reduceMotion)} className="flex flex-col gap-2 py-4">
      <IngredientRowContent ingredient={ingredient} editing={editing} onRequestRemove={editing.remove} />
    </motion.li>
  );
};

interface RemovedIngredientRowProps {
  productName: string;
  isRestoring: boolean;
  error: string | null;
  onUndo: () => void;
  onDismiss: () => void;
}

// Holds the removed row's place for as long as the page stays open - no timer
// to race, so Undo is there whenever the user notices the slip. autoFocus
// catches keyboard focus that would otherwise fall to <body> with the
// unmounted Remove button.
export const RemovedIngredientRow = ({ productName, isRestoring, error, onUndo, onDismiss }: RemovedIngredientRowProps) => {
  const reduceMotion = useReducedMotion();
  const name = displayProductName(productName);

  return (
    <motion.li layout={!reduceMotion} variants={rowEnterVariants} initial="hidden" animate="visible" exit={rowExit(reduceMotion)} className="flex flex-col gap-2 py-4">
      <div className="flex items-center justify-between gap-3 text-sm text-text-muted">
        <span className="truncate">
          <span className="text-text">{name}</span> removed
        </span>
        <div className="flex shrink-0 items-center gap-1">
          <Button variant="primary" link autoFocus pending={isRestoring} aria-label={`Undo removing ${name}`} onClick={onUndo}>
            Undo
          </Button>
          {/* Same as DeletedMealNotice: disabled mid-restore, -my-3 keeps the row height. */}
          <button
            type="button"
            onClick={onDismiss}
            disabled={isRestoring}
            aria-label={`Dismiss, ${name} removed`}
            className={`${ICON_TAP_TARGET_CLASS} ${ICON_ROW_EDGE_PULL_RIGHT} -my-3 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-transparent`}
          >
            <XIcon weight="regular" />
          </button>
        </div>
      </div>
      {error && <InlineMessage tone="error">{error}</InlineMessage>}
    </motion.li>
  );
};
