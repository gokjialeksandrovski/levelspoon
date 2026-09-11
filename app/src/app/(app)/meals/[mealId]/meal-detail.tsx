"use client";

import { motion, useReducedMotion } from "motion/react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { getMealDetail } from "@/actions/meals";
import type { MealDetail as MealDetailData, MealIngredientDetail } from "@/actions/meals";
import { AppHeader } from "@/components/app-header";
import { buttonClassName } from "@/components/button";
import { todayLocalDateString } from "@/lib/date/day-bounds";
import { contentFadeInitial, contentFadeTransition } from "@/lib/motion/step-transition";
import { useDelayedSkeleton } from "@/lib/motion/use-delayed-skeleton";

import { CookingFatControl } from "./cooking-fat-control";
import { DayTotalBar } from "./day-total-bar";
import { DeleteMeal } from "./delete-meal";
import { IngredientRow } from "./ingredient-row";

type MealDetailState =
  | { status: "loading" }
  | { status: "error" }
  | { status: "not-found" }
  | { status: "ready"; meal: MealDetailData };

// Sets state only from the fetch's `.then`/`.catch`, never synchronously in
// the effect body (react-hooks/set-state-in-effect flags that as an error).
// `reloadCounter` is a bump signal in the dependency array: an in-place
// ingredient edit reuses this Client Component instance, so a mount-only
// effect would miss the change.
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

// Transient: a meal briefly has zero ingredients between an add and this
// page's refetch. discardEmptyMeal sweeps truly-abandoned ones server-side.
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
    {/* Keyed on reloadCounter so any ingredient change remounts DayTotalBar
        and re-runs its mount-only fetch (see useMealDetail above). */}
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
      <CookingFatControl mealId={mealId} onIngredientChanged={onIngredientChanged} />
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

interface MealDetailContentProps {
  state: Exclude<MealDetailState, { status: "loading" }>;
  mealId: string;
  reloadCounter: number;
  onIngredientChanged: () => void;
}

const MealDetailContent = ({ state, mealId, reloadCounter, onIngredientChanged }: MealDetailContentProps) => {
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

// Same delayed-skeleton + fade-in treatment as DayViewBody/HistoryBody, so
// a fast fetch doesn't flash "Loading…" then jump-cut to content
// (/critique, 2026-09-10).
const MealDetailBody = ({ state, mealId, reloadCounter, onIngredientChanged }: MealDetailBodyProps) => {
  const reduceMotion = useReducedMotion();
  const showSkeleton = useDelayedSkeleton(state.status === "loading");

  if (state.status === "loading") {
    return showSkeleton ? <p className="text-sm text-text-muted">Loading…</p> : null;
  }

  return (
    <motion.div
      initial={contentFadeInitial(reduceMotion)}
      animate={{ opacity: 1 }}
      transition={contentFadeTransition(reduceMotion)}
    >
      <MealDetailContent state={state} mealId={mealId} reloadCounter={reloadCounter} onIngredientChanged={onIngredientChanged} />
    </motion.div>
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
      <main id="main-content" tabIndex={-1} className="flex-1 px-4 py-6 focus:outline-none">
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
