// app/src/app/(app)/meals/[mealId]/meal-detail.tsx
"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { getMealDetail } from "@/actions/meals";
import type { MealDetail as MealDetailData, MealIngredientDetail } from "@/actions/meals";
import { AppHeader } from "@/components/app-header";
import { buttonClassName } from "@/components/button";
import { todayLocalDateString } from "@/lib/date/day-bounds";

import { DayTotalBar } from "./day-total-bar";
import { DeleteMeal } from "./delete-meal";
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
// Component instance is reused (not remounted) when an ingredient row edits or
// removes itself in place, so a mount-only effect would never see the change.
// Including `reloadCounter` in the effect's dependency array gives callers an
// explicit way to force a re-fetch instead. (Adding an ingredient no longer
// needs this - that leaves the page for the /capture route and comes back to a
// fresh mount.)
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
  <ul className="mt-4 divide-y divide-border">
    {ingredients.map((ingredient) => (
      <IngredientRow key={ingredient.id} ingredient={ingredient} onChanged={onIngredientChanged} />
    ))}
  </ul>
);

const MealTotal = ({ energyKcal }: { energyKcal: number }) => (
  <p className="mt-4 text-sm text-text-muted">
    Meal total <span className="tabular-nums text-text">{Math.round(energyKcal)} kcal</span>
  </p>
);

// A meal can theoretically render with zero ingredients for a moment between
// an ingredient being added and this page's own refetch landing -
// discardEmptyMeal (Task 3) cleans truly-abandoned empty meals up server-side,
// so this is a transient display state, not a dead end.
const EmptyIngredients = () => <p className="mt-4 text-sm text-text-muted">No ingredients yet.</p>;

// notFound() (next/navigation) only works in a Server Component - this is a
// Client Component, so a not-found meal renders inline instead.
const MealNotFound = () => (
  <div className="flex flex-col gap-3">
    <p className="text-sm text-text-muted">Meal not found.</p>
    <Link href="/" className="text-sm text-text underline">
      Back home
    </Link>
  </div>
);

interface MealDetailProps {
  mealId: string;
}

// AppHeader's title needs a value in every state, but the meal number only
// exists once the fetch resolves - "Meal" is the interim label for
// loading/error/not-found.
const mealDetailTitle = (state: MealDetailState): string =>
  state.status === "ready" ? `Meal ${state.meal.mealNumber}` : "Meal";

// Mirrors mealDetailTitle's pattern: Back should return to the meal's own
// local day (which may be a day in the past, reached via History), not
// always today - but that date only exists once the fetch resolves, so
// today is the interim fallback for loading/error/not-found.
const mealDetailBackHref = (state: MealDetailState, today: string): string =>
  `/day/${state.status === "ready" ? state.meal.date : today}`;

interface MealReadyBodyProps {
  meal: MealDetailData;
  mealId: string;
  reloadCounter: number;
  onIngredientChanged: () => void;
}

interface IngredientsSectionProps {
  ingredients: MealIngredientDetail[];
  energyKcal: number;
  onIngredientChanged: () => void;
}

const IngredientsSection = ({ ingredients, energyKcal, onIngredientChanged }: IngredientsSectionProps) =>
  ingredients.length > 0 ? (
    <>
      <IngredientList ingredients={ingredients} onIngredientChanged={onIngredientChanged} />
      <MealTotal energyKcal={energyKcal} />
    </>
  ) : (
    <EmptyIngredients />
  );

const MealReadyBody = ({ meal, mealId, reloadCounter, onIngredientChanged }: MealReadyBodyProps) => (
  <>
    {/*
      Keyed on reloadCounter (rather than the old server-side Date.now()
      trick) so any change below - a new, edited, or removed ingredient -
      remounts DayTotalBar and its own mount-only fetch effect runs again -
      see useMealDetail's comment above for why a plain router.refresh()
      can't do this on its own.
    */}
    <DayTotalBar key={reloadCounter} />
    <IngredientsSection
      ingredients={meal.ingredients}
      energyKcal={meal.total.energyKcal}
      onIngredientChanged={onIngredientChanged}
    />
    <div className="mt-6 flex flex-col gap-3">
      {/*
        A plain navigation link, not an inline reveal: the capture wizard
        owns the full-screen /capture route now, and returning from it
        remounts this page rather than refreshing it in place.
      */}
      <Link href={`/meals/${mealId}/capture`} className={buttonClassName("primary", "text-center")}>
        Add ingredient
      </Link>
      <DeleteMeal mealId={mealId} mealDate={meal.date} />
    </div>
  </>
);

interface MealDetailBodyProps {
  state: MealDetailState;
  mealId: string;
  reloadCounter: number;
  onIngredientChanged: () => void;
}

const MealDetailBody = ({ state, mealId, reloadCounter, onIngredientChanged }: MealDetailBodyProps) => {
  if (state.status === "loading") {
    return <p className="text-sm text-text-muted">Loading…</p>;
  }
  if (state.status === "error") {
    return <p className="text-sm text-danger">Could not load this meal. Please try again.</p>;
  }
  if (state.status === "not-found") {
    return <MealNotFound />;
  }

  return (
    <MealReadyBody
      meal={state.meal}
      mealId={mealId}
      reloadCounter={reloadCounter}
      onIngredientChanged={onIngredientChanged}
    />
  );
};

export const MealDetail = ({ mealId }: MealDetailProps) => {
  const [reloadCounter, setReloadCounter] = useState(0);
  const bumpReload = () => setReloadCounter((count) => count + 1);
  const state = useMealDetail(mealId, reloadCounter);
  const today = todayLocalDateString(Intl.DateTimeFormat().resolvedOptions().timeZone);

  return (
    <>
      <AppHeader variant="back" title={mealDetailTitle(state)} backHref={mealDetailBackHref(state, today)} />
      <main className="flex-1 px-4 py-6">
        <MealDetailBody
          state={state}
          mealId={mealId}
          reloadCounter={reloadCounter}
          onIngredientChanged={bumpReload}
        />
      </main>
    </>
  );
};
