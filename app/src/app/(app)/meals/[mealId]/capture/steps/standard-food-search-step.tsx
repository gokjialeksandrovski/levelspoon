"use client";

import { type SubmitEvent, useState } from "react";

import { searchStandardFoods, type StandardFood } from "@/features/products/actions/products";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { InlineMessage } from "@/components/ui/inline-message";
import { Skeleton } from "@/components/ui/skeleton";
import { FOCUS_RING, TEXT_LINK_SM } from "@/components/ui/tap-target";

import type { PathAction } from "../capture-wizard.path";
import { toSelectedProduct } from "../capture-wizard.types";

interface StandardFoodSearchStepProps {
  dispatch: (action: PathAction) => void;
}

// T3 is the "whole food, no packaging" entry point; cooking fats/oils get
// their own T4 affordance (category "fat") on meal-detail, so this step
// filters to "whole" to keep the two pick lists from overlapping.
const WHOLE_FOOD_CATEGORY = "whole" as const;

interface SearchCallbacks {
  onResults: (results: StandardFood[]) => void;
  onError: (error: string | null) => void;
  onLoadingChange: (isLoading: boolean) => void;
}

const runSearch = async (query: string, callbacks: SearchCallbacks): Promise<void> => {
  callbacks.onError(null);
  callbacks.onLoadingChange(true);
  try {
    const results = await searchStandardFoods(query, WHOLE_FOOD_CATEGORY);
    callbacks.onResults(results);
  } catch {
    callbacks.onError("Could not search whole foods. Please try again.");
  } finally {
    callbacks.onLoadingChange(false);
  }
};

interface UseStandardFoodSearchResult {
  query: string;
  setQuery: (value: string) => void;
  results: StandardFood[] | null;
  isLoading: boolean;
  error: string | null;
  handleSearch: (event: SubmitEvent<HTMLFormElement>) => void;
  choose: (food: StandardFood) => void;
}

const useStandardFoodSearch = (dispatch: (action: PathAction) => void): UseStandardFoodSearchResult => {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<StandardFood[] | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const callbacks: SearchCallbacks = { onResults: setResults, onError: setError, onLoadingChange: setIsLoading };
  const handleSearch = (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    void runSearch(query, callbacks);
  };
  const choose = (food: StandardFood) => dispatch({ type: "WHOLE_FOOD_CHOSEN", product: toSelectedProduct(food) });

  return { query, setQuery, results, isLoading, error, handleSearch, choose };
};

interface StandardFoodSearchFormProps {
  query: string;
  isLoading: boolean;
  onChange: (value: string) => void;
  onSubmit: (event: SubmitEvent<HTMLFormElement>) => void;
}

const StandardFoodSearchForm = ({ query, isLoading, onChange, onSubmit }: StandardFoodSearchFormProps) => (
  <form onSubmit={onSubmit} className="flex flex-col gap-3">
    <Field label="Food name" name="standard-food-query" value={query} onChange={(event) => onChange(event.target.value)} />
    <Button type="submit" disabled={query.trim() === ""} pending={isLoading}>
      Search
    </Button>
  </form>
);

interface StandardFoodResultButtonProps {
  food: StandardFood;
  onChoose: (food: StandardFood) => void;
}

const StandardFoodResultButton = ({ food, onChoose }: StandardFoodResultButtonProps) => (
  <li>
    <button type="button" onClick={() => onChoose(food)} className={`w-full py-3 text-left text-text ${FOCUS_RING}`}>
      {food.name}
    </button>
  </li>
);

const EmptyResults = ({ dispatch }: { dispatch: (action: PathAction) => void }) => (
  <div className="flex flex-col gap-2">
    <p className="text-sm text-text-muted">No match. If it is packaged, photograph the label.</p>
    <button type="button" onClick={() => dispatch({ type: "BACK" })} className={TEXT_LINK_SM}>
      <span>Back to product photo</span>
    </button>
  </div>
);

interface StandardFoodResultsProps {
  results: StandardFood[];
  onChoose: (food: StandardFood) => void;
  dispatch: (action: PathAction) => void;
}

const StandardFoodResults = ({ results, onChoose, dispatch }: StandardFoodResultsProps) =>
  results.length === 0 ? (
    <EmptyResults dispatch={dispatch} />
  ) : (
    <ul className="divide-y divide-border">
      {results.map((food) => (
        <StandardFoodResultButton key={food.id} food={food} onChoose={onChoose} />
      ))}
    </ul>
  );

export const StandardFoodSearchStep = ({ dispatch }: StandardFoodSearchStepProps) => {
  const form = useStandardFoodSearch(dispatch);

  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-lg font-semibold">Search whole foods</h2>
      <StandardFoodSearchForm query={form.query} isLoading={form.isLoading} onChange={form.setQuery} onSubmit={form.handleSearch} />
      {form.error && <InlineMessage tone="error">{form.error}</InlineMessage>}
      {form.isLoading && <Skeleton className="h-10 w-full" />}
      {form.results !== null && !form.isLoading && (
        <StandardFoodResults results={form.results} onChoose={form.choose} dispatch={dispatch} />
      )}
    </div>
  );
};
