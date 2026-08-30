// app/src/app/(app)/day/[date]/day-view.tsx
"use client";

import { motion, useReducedMotion } from "motion/react";
import { useCallback, useEffect, useState } from "react";

import { getDayLog } from "@/actions/meals";
import type { DayLog } from "@/actions/meals";
import { AppHeader } from "@/components/app-header";
import { InlineMessage } from "@/components/inline-message";
import { Skeleton } from "@/components/skeleton";
import { Stat } from "@/components/stat";
import { todayLocalDateString } from "@/lib/date/day-bounds";

import { DayEmptyState } from "./day-empty-state";
import { DayMacros } from "./day-macros";
import { MealList } from "./meal-list";

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

// Mirrors the ready-state shape (stat block + three meal rows) so the
// loading -> ready swap doesn't jump around.
const DayViewSkeleton = () => (
  <div className="flex flex-col gap-2">
    <Skeleton className="h-11 w-32" />
    <Skeleton className="h-4 w-48" />
    <div className="mt-6 flex flex-col gap-4">
      <Skeleton className="h-12 w-full" />
      <Skeleton className="h-12 w-full" />
      <Skeleton className="h-12 w-full" />
    </div>
  </div>
);

const DayViewReady = ({ log, isToday }: { log: DayLog; isToday: boolean }) => (
  <>
    <Stat value={Math.round(log.dayTotal.energyKcal).toLocaleString()} unit="kcal" />
    <DayMacros total={log.dayTotal} />
    {log.meals.length === 0 ? <DayEmptyState isToday={isToday} /> : <MealList meals={log.meals} />}
  </>
);

const DayViewBody = ({ state }: { state: DayViewState }) => {
  if (state.status === "loading") {
    return <DayViewSkeleton />;
  }
  if (state.status === "error") {
    return <InlineMessage tone="error">Could not load this day. Please try again.</InlineMessage>;
  }
  return <DayViewReady log={state.log} isToday={state.isToday} />;
};

// One of only two places in the app allowed to use motion/react (the other
// is the capture wizard) - see the project's Global Constraints. Keyed on
// `date` so prev/next navigation remounts this element and its `initial`
// animation replays; `useReducedMotion` collapses that to an instant,
// motion-free swap (initial={false} skips the enter transition entirely).
const SLIDE_OFFSET_PX = 24;
const TRANSITION_DURATION_SECONDS = 0.26; // matches globals.css --duration-step
// Mirrors globals.css's --ease-out-quart cubic-bezier control points exactly,
// broken into named constants so neither counts as an unexplained magic number.
const EASE_OUT_QUART_X1 = 0.16;
const EASE_OUT_QUART_Y1 = 1;
const EASE_OUT_QUART_X2 = 0.3;
const EASE_OUT_QUART_Y2 = 1;
const TRANSITION_EASE: [number, number, number, number] = [
  EASE_OUT_QUART_X1,
  EASE_OUT_QUART_Y1,
  EASE_OUT_QUART_X2,
  EASE_OUT_QUART_Y2,
];

export const DayView = ({ date }: DayViewProps) => {
  const state = useDayLog(date);
  const reduceMotion = useReducedMotion();

  return (
    <>
      <AppHeader variant="day" date={date} />
      <motion.main
        key={date}
        className="flex-1 px-4 py-6"
        initial={reduceMotion ? false : { opacity: 0, x: SLIDE_OFFSET_PX }}
        animate={{ opacity: 1, x: 0 }}
        transition={reduceMotion ? { duration: 0 } : { duration: TRANSITION_DURATION_SECONDS, ease: TRANSITION_EASE }}
      >
        <DayViewBody state={state} />
      </motion.main>
    </>
  );
};
