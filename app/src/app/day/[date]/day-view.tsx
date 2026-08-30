// app/src/app/day/[date]/day-view.tsx
"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { getDayLog } from "@/actions/meals";
import type { DayLog, DayMealSummary } from "@/actions/meals";
import { addCalendarDays, todayLocalDateString } from "@/lib/date/day-bounds";

interface DayViewProps {
  date: string;
}

type DayViewState =
  | { status: "loading" }
  | { status: "error" }
  | { status: "ready"; log: DayLog; isToday: boolean };

// Only sets state from within the fetch's `.then`/`.catch` - never
// synchronously at the top of the effect - matching the precedent in
// day-total-bar.tsx and history/page.tsx (react-hooks/set-state-in-effect
// flags a synchronous setState call in an effect body as an error, even one
// reached indirectly through a helper, and even for the "reset to loading"
// call React's own data-fetching docs show).
const useDayLog = (date: string): DayViewState => {
  const [state, setState] = useState<DayViewState>({ status: "loading" });

  const load = useCallback(() => {
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    getDayLog(date, timezone)
      .then((log) => setState({ status: "ready", log, isToday: date === todayLocalDateString(timezone) }))
      .catch(() => setState({ status: "error" }));
  }, [date]);

  useEffect(() => {
    load();
  }, [load]);

  return state;
};

const DayNavigation = ({ date }: { date: string }) => (
  <div className="flex items-center justify-between">
    <Link href={`/day/${addCalendarDays(date, -1)}`} className="text-blue-600 underline">
      ← Previous day
    </Link>
    <span className="font-medium">{date}</span>
    <Link href={`/day/${addCalendarDays(date, 1)}`} className="text-blue-600 underline">
      Next day →
    </Link>
  </div>
);

const DayTotalSummary = ({ log }: { log: DayLog }) => (
  <div className="rounded border bg-gray-50 p-3 text-sm">
    <span className="font-medium">Day total: </span>
    {Math.round(log.dayTotal.energyKcal)} kcal · {log.dayTotal.proteinG.toFixed(1)}g protein ·{" "}
    {log.dayTotal.carbohydrateG.toFixed(1)}g carbs · {log.dayTotal.fatG.toFixed(1)}g fat
  </div>
);

const MAX_NAMES_SHOWN = 2;
const summariseIngredients = (names: string[]): string => {
  if (names.length <= MAX_NAMES_SHOWN) return names.join(", ");
  return `${names.slice(0, MAX_NAMES_SHOWN).join(", ")}, +${names.length - MAX_NAMES_SHOWN}`;
};

const MealListItem = ({ meal, index }: { meal: DayMealSummary; index: number }) => (
  <li>
    <Link href={`/meals/${meal.id}`} className="block rounded border p-3 hover:bg-gray-50">
      <span className="font-medium">Meal {index + 1}</span>
      <span className="block text-sm text-gray-600">
        {summariseIngredients(meal.ingredientNames)} · {Math.round(meal.total.energyKcal)} kcal
      </span>
    </Link>
  </li>
);

const MealList = ({ meals }: { meals: DayMealSummary[] }) => (
  <ul className="flex flex-col gap-2">
    {meals.map((meal, index) => (
      <MealListItem key={meal.id} meal={meal} index={index} />
    ))}
  </ul>
);

const EmptyDayState = ({ isToday }: { isToday: boolean }) => (
  <div className="flex flex-col items-center gap-3 py-8 text-center">
    <p className="text-gray-600">No meals logged</p>
    {isToday && (
      <Link href="/meals/new" className="rounded bg-blue-600 px-4 py-2 text-white">
        Start a meal
      </Link>
    )}
  </div>
);

const DayLogContent = ({ log, isToday }: { log: DayLog; isToday: boolean }) =>
  log.meals.length === 0 ? (
    <EmptyDayState isToday={isToday} />
  ) : (
    <>
      <DayTotalSummary log={log} />
      <MealList meals={log.meals} />
    </>
  );

export const DayView = ({ date }: DayViewProps) => {
  const state = useDayLog(date);

  if (state.status === "loading") {
    return <p className="text-sm text-gray-500">Loading…</p>;
  }
  if (state.status === "error") {
    return <p className="text-sm text-red-600">Could not load this day. Please try again.</p>;
  }

  return (
    <div className="flex flex-col gap-4">
      <DayNavigation date={date} />
      <DayLogContent log={state.log} isToday={state.isToday} />
    </div>
  );
};
