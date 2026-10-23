"use client";

import { DropIcon } from "@phosphor-icons/react";
import { useState } from "react";

import { saveMealIngredient } from "@/features/meals/actions/meals";
import { previewContribution } from "@/features/meals/actions/meals.utils";
import type { StandardFood } from "@/features/products/actions/products";
import { Button } from "@/components/ui/button";
import { InlineMessage } from "@/components/ui/inline-message";
import { Sheet } from "@/components/ui/sheet";
import { EMPTY_AMOUNT_MESSAGE, UnitAmountField } from "@/components/ui/unit-amount-field";
import { triggerLogSuccessHaptic } from "@/lib/haptics/log-success";
import { availableUnits, defaultUnit } from "@/lib/measures/available-units";
import type { MeasureContext } from "@/lib/measures/resolve-grams";
import { resolveQuantity } from "@/lib/measures/resolve-quantity";
import { AmountChips, useRecentAmounts } from "./amount-chips";
import { mergeChips, unitsForSelect } from "./amount-chips.utils";
import { AmountPreview } from "./nutrition-summary";
import { StandardFoodPicker, useStandardFoodPicker, type UseStandardFoodPickerResult } from "./standard-food-picker";

// Other half of the spec §5 category split - oils, butter, ghee, spray.
const COOKING_FAT_CATEGORY = "fat" as const;

const contextFor = (food: StandardFood): MeasureContext => ({
  productName: food.name,
  densityGMl: food.densityGMl,
  servingUnit: food.servingUnit,
  servingGrams: food.servingGrams,
  nutritionBasisUnit: food.nutritionBasisUnit,
  portions: food.portions,
});

// Cooking fats are near-universally measured by spoon - tbsp offered first
// when density resolves it (spec §8), else available-units.ts's default.
const COOKING_FAT_PREFERRED_UNIT = "tbsp";

export const initialCookingUnit = (context: MeasureContext): string => {
  const units = availableUnits(context);
  return units.includes(COOKING_FAT_PREFERRED_UNIT) ? COOKING_FAT_PREFERRED_UNIT : defaultUnit(context);
};

interface CookingFatCallbacks {
  setError: (error: string | null) => void;
  setIsBusy: (isBusy: boolean) => void;
}

export interface SaveCookingFatInput {
  mealId: string;
  productId: string;
  quantity: number;
  quantityUnit: string;
  entryCount: number;
  entryUnit: string;
}

const commitCookingFat = async (input: SaveCookingFatInput, onSaved: () => void): Promise<void> => {
  await saveMealIngredient({
    mealId: input.mealId,
    productId: input.productId,
    quantity: input.quantity,
    quantityUnit: input.quantityUnit,
    entryCount: input.entryCount,
    entryUnit: input.entryUnit,
    quantitySource: "manual",
  });
  triggerLogSuccessHaptic();
  onSaved();
};

// Always "manual" - no photo estimate on this path (spec §7).
export const saveCookingFat = async (
  input: SaveCookingFatInput,
  onSaved: () => void,
  callbacks: CookingFatCallbacks,
): Promise<void> => {
  callbacks.setError(null);
  callbacks.setIsBusy(true);
  try {
    await commitCookingFat(input, onSaved);
  } catch (error) {
    console.error("Saving the cooking fat ingredient failed", error);
    callbacks.setError("Couldn't add this to the meal. Try again.");
  } finally {
    callbacks.setIsBusy(false);
  }
};

export interface ResolveAndSaveCookingFatInput {
  mealId: string;
  productId: string;
  count: string;
  unit: string;
  context: MeasureContext;
}

export const resolveAndSaveCookingFat = async (
  input: ResolveAndSaveCookingFatInput,
  onSaved: () => void,
  callbacks: CookingFatCallbacks,
): Promise<void> => {
  if (input.count.trim() === "") {
    callbacks.setError(EMPTY_AMOUNT_MESSAGE);
    return;
  }
  const resolution = resolveQuantity(input.count, input.unit, input.context);
  if (resolution.kind === "unresolved") {
    callbacks.setError(`Couldn’t work out the amount in “${input.unit}”. Try a different unit.`);
    return;
  }
  await saveCookingFat(
    // "1 tbsp" stays "1 tbsp" on the meal row, not the grams it resolved to.
    { mealId: input.mealId, productId: input.productId, quantity: resolution.quantity, quantityUnit: resolution.quantityUnit, entryCount: Number(input.count), entryUnit: input.unit },
    onSaved,
    callbacks,
  );
};

const COOKING_FAT_SEARCH_ERROR = "Could not search cooking fats. Please try again.";
const COOKING_FAT_EMPTY_MESSAGE = "No match. Check spelling, or try a broader term like “olive oil”.";

interface CookingFatSearchStageProps {
  search: UseStandardFoodPickerResult;
  onChoose: (food: StandardFood) => void;
}

const CookingFatSearchStage = ({ search, onChoose }: CookingFatSearchStageProps) => (
  <StandardFoodPicker
    fieldName="cooking-fat-query"
    picker={search}
    emptyMessage={COOKING_FAT_EMPTY_MESSAGE}
    onChoose={onChoose}
  />
);

interface CookingFatAmountStageProps {
  mealId: string;
  food: StandardFood;
  onBack: () => void;
  onSaved: () => void;
}

const useCookingFatAmount = (mealId: string, food: StandardFood, onSaved: () => void) => {
  const context = contextFor(food);
  const { recents, isLoading: isLoadingChips } = useRecentAmounts(food.id);
  const chips = mergeChips(recents, food.portions);
  const [count, setCount] = useState("");
  const [unit, setUnit] = useState(initialCookingUnit(context));
  const [error, setError] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const callbacks = { setError, setIsBusy };
  const handleSave = () =>
    resolveAndSaveCookingFat({ mealId, productId: food.id, count, unit, context }, onSaved, callbacks);
  const preview = previewContribution({
    count,
    unit,
    context,
    nutritionPerBasis: food.nutritionPer100g,
    basisQuantity: food.nutritionBasisQuantity,
  });

  const pickChip = (chipCount: string, chipUnit: string) => {
    setCount(chipCount);
    setUnit(chipUnit);
  };

  return { count, unit, units: availableUnits(context), chips, isLoadingChips, preview, error, isBusy, setCount, setUnit, pickChip, handleSave };
};

// Keyed by food.id in CookingFatSheet so a different result remounts this
// with fresh state, no reset effect needed.
const CookingFatAmountStage = ({ mealId, food, onBack, onSaved }: CookingFatAmountStageProps) => {
  const { count, unit, units, chips, isLoadingChips, preview, error, isBusy, setCount, setUnit, pickChip, handleSave } = useCookingFatAmount(
    mealId,
    food,
    onSaved,
  );

  // Same three groups and the same four-distance ladder as the capture amount
  // step (see AmountStepFields): 6/12/16/24. Sheet scrolls at 85dvh, so the
  // grouping costs no reachable content.
  return (
    <div className="flex flex-col gap-6">
      {/* "Pick another", the same words the capture step's escape uses: both
          leave this product for a different one, and one escape should not
          have two names across two screens. */}
      <Button variant="ghost" link onClick={onBack}>
        Pick another
      </Button>
      <div className="flex flex-col gap-4">
        <AmountChips chips={chips} count={count} unit={unit} isLoading={isLoadingChips} onPick={pickChip} />
        {/* No autoFocus, matching the capture step: this field is the fallback
            and the chips above it are the input. Focusing it raises the mobile
            keyboard over the chip row before the user has seen it, which is
            worse inside a sheet than on a page, not better. */}
        <UnitAmountField name="cooking-fat-amount" count={count} unit={unit} units={unitsForSelect(units, chips, unit)} onCountChange={setCount} onUnitChange={setUnit} />
      </div>
      <div className="flex flex-col gap-4">
        <AmountPreview preview={preview} />
        {error && <InlineMessage tone="error">{error}</InlineMessage>}
        <Button pending={isBusy} onClick={handleSave}>
          Add to meal
        </Button>
      </div>
    </div>
  );
};

type CookingFatStage = { kind: "search" } | { kind: "amount"; food: StandardFood };

const cookingFatSheetTitle = (stage: CookingFatStage): string =>
  stage.kind === "amount" ? `Using ${stage.food.name}` : "Add cooking oil or fat";

interface CookingFatSheetProps {
  isOpen: boolean;
  stage: CookingFatStage;
  mealId: string;
  search: UseStandardFoodPickerResult;
  onChoose: (food: StandardFood) => void;
  onBack: () => void;
  onClose: () => void;
  onSaved: () => void;
}

const CookingFatSheet = ({ isOpen, stage, mealId, search, onChoose, onBack, onClose, onSaved }: CookingFatSheetProps) => (
  <Sheet open={isOpen} onClose={onClose} title={cookingFatSheetTitle(stage)}>
    {stage.kind === "search" ? (
      <CookingFatSearchStage search={search} onChoose={onChoose} />
    ) : (
      <CookingFatAmountStage key={stage.food.id} mealId={mealId} food={stage.food} onBack={onBack} onSaved={onSaved} />
    )}
  </Sheet>
);

const buildCookingFatActions = (setIsOpen: (value: boolean) => void, setStage: (value: CookingFatStage) => void) => {
  const close = () => {
    setIsOpen(false);
    setStage({ kind: "search" });
  };

  return {
    open: () => setIsOpen(true),
    close,
    // saveMealIngredient refreshes the route, so the new row arrives with it.
    saved: close,
    choose: (food: StandardFood) => setStage({ kind: "amount", food }),
    back: () => setStage({ kind: "search" }),
  };
};

const useCookingFatControl = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [stage, setStage] = useState<CookingFatStage>({ kind: "search" });
  const search = useStandardFoodPicker(COOKING_FAT_CATEGORY, COOKING_FAT_SEARCH_ERROR);

  return { isOpen, stage, search, ...buildCookingFatActions(setIsOpen, setStage) };
};

// The meal-detail affordance itself (spec §8): optional, defaults to
// nothing added, sits between "Add ingredient" and "Delete meal".
export const CookingFatControl = ({ mealId }: { mealId: string }) => {
  const control = useCookingFatControl();

  return (
    <>
      <Button variant="fat" onClick={control.open}>
        <DropIcon size={20} /> Add cooking oil or fat
      </Button>
      <CookingFatSheet
        isOpen={control.isOpen}
        stage={control.stage}
        mealId={mealId}
        search={control.search}
        onChoose={control.choose}
        onBack={control.back}
        onClose={control.close}
        onSaved={control.saved}
      />
    </>
  );
};
