"use client";

import { type ReactNode, type SubmitEvent, useState } from "react";

import {
  searchStandardFoods,
  type StandardFood,
  type StandardFoodCategory,
} from "@/features/products/actions/products";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { InlineMessage } from "@/components/ui/inline-message";
import { LiveStatus } from "@/components/ui/live-status";
import { Skeleton } from "@/components/ui/skeleton";
import { FOCUS_RING } from "@/components/ui/tap-target";

import { ProductSummary } from "./nutrition-summary";

interface StandardFoodSearchCallbacks {
  onResults: (results: StandardFood[]) => void;
  onError: (error: string | null) => void;
  onLoadingChange: (isLoading: boolean) => void;
}

const runStandardFoodSearch = async (
  query: string,
  category: StandardFoodCategory,
  searchErrorMessage: string,
  callbacks: StandardFoodSearchCallbacks,
): Promise<void> => {
  callbacks.onError(null);
  callbacks.onLoadingChange(true);
  try {
    const results = await searchStandardFoods(query, category);
    callbacks.onResults(results);
  } catch {
    callbacks.onError(searchErrorMessage);
  } finally {
    callbacks.onLoadingChange(false);
  }
};

export interface UseStandardFoodPickerResult {
  query: string;
  setQuery: (value: string) => void;
  results: StandardFood[] | null;
  isLoading: boolean;
  error: string | null;
  handleSearch: (event: SubmitEvent<HTMLFormElement>) => void;
}

const EMPTY_QUERY_ERROR = "Type a food name first.";

// Shared by the whole-food and cooking-fat pickers - both search the same
// standardFoods table, filtered by category, and only diverge in copy.
export const useStandardFoodPicker = (
  category: StandardFoodCategory,
  searchErrorMessage: string,
): UseStandardFoodPickerResult => {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<StandardFood[] | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const callbacks = { onResults: setResults, onError: setError, onLoadingChange: setIsLoading };

  const handleSearch = (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isLoading) return;
    if (query.trim() === "") {
      setError(EMPTY_QUERY_ERROR);
      return;
    }
    void runStandardFoodSearch(query, category, searchErrorMessage, callbacks);
  };

  return { query, setQuery, results, isLoading, error, handleSearch };
};

interface StandardFoodPickerFormProps {
  fieldName: string;
  query: string;
  isLoading: boolean;
  onChange: (value: string) => void;
  onSubmit: (event: SubmitEvent<HTMLFormElement>) => void;
}

const StandardFoodPickerForm = ({ fieldName, query, isLoading, onChange, onSubmit }: StandardFoodPickerFormProps) => (
  <form onSubmit={onSubmit} className="flex flex-col gap-3">
    <Field label="Food name" name={fieldName} type="search" spellCheck={false} value={query} onChange={(event) => onChange(event.target.value)} />
    <Button type="submit" pending={isLoading}>
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
      <ProductSummary
        name={food.name}
        brand={null}
        nutritionPerBasis={food.nutritionPer100g}
        basisQuantity={food.nutritionBasisQuantity}
        basisUnit={food.nutritionBasisUnit}
      />
    </button>
  </li>
);

interface StandardFoodResultsListProps {
  results: StandardFood[];
  emptyMessage: string;
  emptyAction?: ReactNode;
  onChoose: (food: StandardFood) => void;
}

const StandardFoodResultsList = ({ results, emptyMessage, emptyAction, onChoose }: StandardFoodResultsListProps) =>
  results.length === 0 ? (
    <div className="flex flex-col gap-2">
      <p className="text-sm text-text-muted">{emptyMessage}</p>
      {emptyAction}
    </div>
  ) : (
    <ul className="divide-y divide-border">
      {results.map((food) => (
        <StandardFoodResultButton key={food.id} food={food} onChoose={onChoose} />
      ))}
    </ul>
  );

// The list appears without a focus move, so its size is said politely.
const resultsStatus = (results: StandardFood[] | null, isLoading: boolean): string => {
  if (results === null || isLoading) return "";
  if (results.length === 0) return "No matches";
  return results.length === 1 ? "1 match" : `${results.length} matches`;
};

export interface StandardFoodPickerProps {
  fieldName: string;
  picker: UseStandardFoodPickerResult;
  emptyMessage: string;
  emptyAction?: ReactNode;
  onChoose: (food: StandardFood) => void;
}

export const StandardFoodPicker = ({ fieldName, picker, emptyMessage, emptyAction, onChoose }: StandardFoodPickerProps) => (
  <div className="flex flex-col gap-4">
    <StandardFoodPickerForm
      fieldName={fieldName}
      query={picker.query}
      isLoading={picker.isLoading}
      onChange={picker.setQuery}
      onSubmit={picker.handleSearch}
    />
    {picker.error && <InlineMessage tone="error">{picker.error}</InlineMessage>}
    <LiveStatus message={resultsStatus(picker.results, picker.isLoading)} />
    {picker.isLoading && <Skeleton className="h-10 w-full" />}
    {picker.results !== null && !picker.isLoading && (
      <StandardFoodResultsList results={picker.results} emptyMessage={emptyMessage} emptyAction={emptyAction} onChoose={onChoose} />
    )}
  </div>
);
