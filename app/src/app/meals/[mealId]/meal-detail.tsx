// app/src/app/meals/[mealId]/meal-detail.tsx
"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { getMealDetail } from "@/actions/meals";
import type { MealDetail as MealDetailData, MealIngredientDetail } from "@/actions/meals";

import { AddIngredientSection } from "./add-ingredient-section";
import { DayTotalBar } from "./day-total-bar";
import { IngredientRow } from "./ingredient-row";

type MealDetailState =
  | { status: "loading" }
  | { status: "error" }
  | { status: "not-found" }
  | { status: "ready"; meal: MealDetailData };

// Only sets state from within the fetch's `.then`/`.catch` - never
// synchronously at the top of the effect - matching the day-view.tsx /
// day-total-bar.tsx precedent (react-hooks/set-state-in-effect flags a
// synchronous setState call in an effect body as an error, even one reached
// indirectly through a helper).
//
// `reloadCounter` is a bump signal, not data `load` itself reads: a Client
// Component instance is reused (not remounted) across a `router.refresh()`
// triggered elsewhere in the tree (the capture wizard after saving an
// ingredient, or an ingredient row's own edit/remove), so a mount-only effect
// would never see the change. Including `reloadCounter` in the effect's
// dependency array gives callers an explicit way to force a re-fetch instead.
const useMealDetail = (mealId: string, reloadCounter: number): MealDetailState => {
  const [state, setState] = useState<MealDetailState>({ status: "loading" });

  const load = useCallback(() => {
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    getMealDetail(mealId, timezone)
      .then((meal) => setState(meal ? { status: "ready", meal } : { status: "not-found" }))
      .catch(() => setState({ status: "error" }));
  }, [mealId]);

  useEffect(() => {
    load();
  }, [load, reloadCounter]);

  return state;
};

interface IngredientListProps {
  ingredients: MealIngredientDetail[];
  onIngredientChanged: () => void;
}

const IngredientList = ({ ingredients, onIngredientChanged }: IngredientListProps) => (
  <ul className="flex flex-col gap-2">
    {ingredients.map((ingredient) => (
      <IngredientRow key={ingredient.id} ingredient={ingredient} onChanged={onIngredientChanged} />
    ))}
  </ul>
);

const MealTotal = ({ energyKcal }: { energyKcal: number }) => (
  <div className="rounded border bg-gray-50 p-3 text-sm">
    <span className="font-medium">Meal total: </span>
    {Math.round(energyKcal)} kcal
  </div>
);

// notFound() (next/navigation) only works in a Server Component - this is a
// Client Component, so a not-found meal renders inline instead.
const MealNotFound = () => (
  <div className="flex flex-col gap-3">
    <p className="text-gray-600">Meal not found.</p>
    <Link href="/" className="text-blue-600 underline">
      Back home
    </Link>
  </div>
);

interface MealDetailProps {
  mealId: string;
}

export const MealDetail = ({ mealId }: MealDetailProps) => {
  const [reloadCounter, setReloadCounter] = useState(0);
  const bumpReload = () => setReloadCounter((count) => count + 1);
  const state = useMealDetail(mealId, reloadCounter);

  if (state.status === "loading") {
    return <p className="text-sm text-gray-500">Loading…</p>;
  }
  if (state.status === "error") {
    return <p className="text-sm text-red-600">Could not load this meal. Please try again.</p>;
  }
  if (state.status === "not-found") {
    return <MealNotFound />;
  }

  const { meal } = state;
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-semibold">Meal {meal.mealNumber}</h1>
      {/*
        Keyed on reloadCounter (rather than the old server-side Date.now()
        trick) so any change below - a new, edited, or removed ingredient -
        remounts DayTotalBar and its own mount-only fetch effect runs again -
        see useMealDetail's comment above for why a plain router.refresh()
        can't do this on its own.
      */}
      <DayTotalBar key={reloadCounter} />
      {meal.ingredients.length > 0 && (
        <IngredientList ingredients={meal.ingredients} onIngredientChanged={bumpReload} />
      )}
      {meal.ingredients.length > 0 && <MealTotal energyKcal={meal.total.energyKcal} />}
      <AddIngredientSection mealId={mealId} onIngredientSaved={bumpReload} />
    </div>
  );
};
