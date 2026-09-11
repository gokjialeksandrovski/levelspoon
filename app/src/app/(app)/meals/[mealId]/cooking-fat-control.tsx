"use client";

import { Drop } from "@phosphor-icons/react";
import { type FormEvent, useState } from "react";

import { saveMealIngredient } from "@/actions/meals";
import { searchStandardFoods, type StandardFood } from "@/actions/products";
import { Button } from "@/components/button";
import { Field } from "@/components/field";
import { InlineMessage } from "@/components/inline-message";
import { Sheet } from "@/components/sheet";
import { Skeleton } from "@/components/skeleton";
import { FOCUS_RING, TEXT_LINK_SM } from "@/components/tap-target";
import { UnitAmountField } from "@/components/unit-amount-field";
import { triggerLogSuccessHaptic } from "@/lib/haptics/log-success";
import { availableUnits, defaultUnit } from "@/lib/measures/available-units";
import { resolveGrams, type MeasureContext } from "@/lib/measures/resolve-grams";

// T3's whole-food search filters to "whole"; this is the other half of the
// spec §5 category split - oils, butter, ghee, spray.
const COOKING_FAT_CATEGORY = "fat" as const;

const contextFor = (food: StandardFood): MeasureContext => ({
  productName: food.name,
  densityGMl: food.densityGMl,
  servingUnit: food.servingUnit,
  servingGrams: food.servingGrams,
});

// Cooking fats are near-universally measured by spoon - tbsp is offered
// first whenever the product's density resolves it (spec §8 T4). Falls back
// to available-units.ts's own default (servingUnit, else grams) for a fat
// row that has no density, which the committed fixture never actually seeds.
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
  grams: string;
}

// Always "manual": there is no photo estimate on this path (spec §7's unit-
// choice-is-manual-entry rule, with no ai_estimated branch at all here).
export const saveCookingFat = async (
  input: SaveCookingFatInput,
  onSaved: () => void,
  callbacks: CookingFatCallbacks,
): Promise<void> => {
  callbacks.setError(null);
  callbacks.setIsBusy(true);
  try {
    await saveMealIngredient({
      mealId: input.mealId,
      productId: input.productId,
      quantityG: Number(input.grams),
      quantitySource: "manual",
    });
    triggerLogSuccessHaptic();
    onSaved();
  } catch (error) {
    console.error("Saving the cooking fat ingredient failed", error);
    callbacks.setError("Could not add this to the meal. Please try again.");
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
  const resolution = resolveGrams(`${input.count} ${input.unit}`, input.context);
  if (resolution.kind === "unresolved") {
    callbacks.setError(`Could not work out the amount in "${input.unit}" - try a different unit.`);
    return;
  }
  await saveCookingFat(
    { mealId: input.mealId, productId: input.productId, grams: String(resolution.grams) },
    onSaved,
    callbacks,
  );
};

interface CookingFatSearchCallbacks {
  onResults: (results: StandardFood[]) => void;
  onError: (error: string | null) => void;
  onLoadingChange: (isLoading: boolean) => void;
}

const runCookingFatSearch = async (query: string, callbacks: CookingFatSearchCallbacks): Promise<void> => {
  callbacks.onError(null);
  callbacks.onLoadingChange(true);
  try {
    const results = await searchStandardFoods(query, COOKING_FAT_CATEGORY);
    callbacks.onResults(results);
  } catch {
    callbacks.onError("Could not search cooking fats. Please try again.");
  } finally {
    callbacks.onLoadingChange(false);
  }
};

interface UseCookingFatSearchResult {
  query: string;
  setQuery: (value: string) => void;
  results: StandardFood[] | null;
  isLoading: boolean;
  error: string | null;
  handleSearch: (event: FormEvent<HTMLFormElement>) => void;
}

const useCookingFatSearch = (): UseCookingFatSearchResult => {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<StandardFood[] | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const callbacks = { onResults: setResults, onError: setError, onLoadingChange: setIsLoading };

  const handleSearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void runCookingFatSearch(query, callbacks);
  };

  return { query, setQuery, results, isLoading, error, handleSearch };
};

interface CookingFatSearchFormProps {
  query: string;
  isLoading: boolean;
  onChange: (value: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}

const CookingFatSearchForm = ({ query, isLoading, onChange, onSubmit }: CookingFatSearchFormProps) => (
  <form onSubmit={onSubmit} className="flex flex-col gap-3">
    <Field label="Oil or fat name" name="cooking-fat-query" value={query} onChange={(event) => onChange(event.target.value)} />
    <Button type="submit" disabled={query.trim() === ""} pending={isLoading}>
      Search
    </Button>
  </form>
);

interface CookingFatResultButtonProps {
  food: StandardFood;
  onChoose: (food: StandardFood) => void;
}

const CookingFatResultButton = ({ food, onChoose }: CookingFatResultButtonProps) => (
  <li>
    <button type="button" onClick={() => onChoose(food)} className={`w-full py-3 text-left text-text ${FOCUS_RING}`}>
      {food.name}
    </button>
  </li>
);

interface CookingFatResultsProps {
  results: StandardFood[];
  onChoose: (food: StandardFood) => void;
}

const CookingFatResults = ({ results, onChoose }: CookingFatResultsProps) =>
  results.length === 0 ? (
    <p className="text-sm text-text-muted">No match. Try a different name.</p>
  ) : (
    <ul className="divide-y divide-border">
      {results.map((food) => (
        <CookingFatResultButton key={food.id} food={food} onChoose={onChoose} />
      ))}
    </ul>
  );

interface CookingFatSearchStageProps {
  search: UseCookingFatSearchResult;
  onChoose: (food: StandardFood) => void;
}

const CookingFatSearchStage = ({ search, onChoose }: CookingFatSearchStageProps) => (
  <div className="flex flex-col gap-4">
    <CookingFatSearchForm query={search.query} isLoading={search.isLoading} onChange={search.setQuery} onSubmit={search.handleSearch} />
    {search.error && <InlineMessage tone="error">{search.error}</InlineMessage>}
    {search.isLoading && <Skeleton className="h-10 w-full" />}
    {search.results !== null && !search.isLoading && <CookingFatResults results={search.results} onChoose={onChoose} />}
  </div>
);

interface CookingFatAmountStageProps {
  mealId: string;
  food: StandardFood;
  onBack: () => void;
  onSaved: () => void;
}

// Keyed by food.id in CookingFatSheet below, so picking a different result
// remounts this with fresh state instead of needing an effect to reset it -
// the same pattern meal-detail.tsx already uses for DayTotalBar.
const CookingFatAmountStage = ({ mealId, food, onBack, onSaved }: CookingFatAmountStageProps) => {
  const context = contextFor(food);
  const units = availableUnits(context);
  const [count, setCount] = useState("");
  const [unit, setUnit] = useState(initialCookingUnit(context));
  const [error, setError] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const callbacks = { setError, setIsBusy };
  const handleSave = () =>
    resolveAndSaveCookingFat({ mealId, productId: food.id, count, unit, context }, onSaved, callbacks);

  return (
    <div className="flex flex-col gap-4">
      <button type="button" onClick={onBack} className={TEXT_LINK_SM}>
        <span>Search again</span>
      </button>
      <UnitAmountField name="cooking-fat-amount" count={count} unit={unit} units={units} autoFocus onCountChange={setCount} onUnitChange={setUnit} />
      {error && <InlineMessage tone="error">{error}</InlineMessage>}
      <Button disabled={count.trim() === ""} pending={isBusy} onClick={handleSave}>
        Add to meal
      </Button>
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
  search: UseCookingFatSearchResult;
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

interface CookingFatControlProps {
  mealId: string;
  onIngredientChanged: () => void;
}

// The meal-detail affordance itself (spec §8 T4): optional, defaults to
// nothing added, sits between "Add ingredient" and "Delete meal".
export const CookingFatControl = ({ mealId, onIngredientChanged }: CookingFatControlProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const [stage, setStage] = useState<CookingFatStage>({ kind: "search" });
  const search = useCookingFatSearch();

  const close = () => {
    setIsOpen(false);
    setStage({ kind: "search" });
  };
  const saved = () => {
    close();
    onIngredientChanged();
  };

  return (
    <>
      <Button variant="fat" onClick={() => setIsOpen(true)}>
        <Drop />
        Add cooking oil or fat
      </Button>
      <CookingFatSheet
        isOpen={isOpen}
        stage={stage}
        mealId={mealId}
        search={search}
        onChoose={(food) => setStage({ kind: "amount", food })}
        onBack={() => setStage({ kind: "search" })}
        onClose={close}
        onSaved={saved}
      />
    </>
  );
};
