"use client";

import { motion, useReducedMotion } from "motion/react";
import { useCallback, useEffect, useState } from "react";

import { getDayLog } from "@/features/meals/actions/meals";
import type { DayLog } from "@/features/meals/actions/meals";
import { AppHeader } from "@/components/layout/app-header";
import { InlineMessage } from "@/components/ui/inline-message";
import { Skeleton } from "@/components/ui/skeleton";
import { Stat } from "@/components/ui/stat";
import { todayLocalDateString } from "@/lib/date/day-bounds";
import { contentFadeInitial, contentFadeTransition, slideInitial, slideTransition } from "@/lib/motion/step-transition";
import { useDelayedSkeleton } from "@/lib/motion/use-delayed-skeleton";

import { DayActionBar } from "./day-action-bar";
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

// setState only inside .then/.catch, never synchronously in the effect body -
// react-hooks/set-state-in-effect flags that as an error even for a "reset to
// loading" call.
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

// Only the kcal stat placeholder, the one piece whose size never depends on
// the day's data - a guessed macro/meal-row shape collapsed on arrival of
// real (often emptier) data, a jump-cut rather than a loading state.
const DayViewSkeleton = () => <Skeleton className="h-11 w-32" />;

const DayViewReady = ({ log, isToday }: { log: DayLog; isToday: boolean }) => (
  <>
    <Stat value={Math.round(log.dayTotal.energyKcal).toLocaleString()} unit="kcal" />
    <DayMacros total={log.dayTotal} />
    {log.meals.length === 0 ? <DayEmptyState isToday={isToday} /> : <MealList meals={log.meals} />}
  </>
);

// Skeleton only shows past useDelayedSkeleton's fast-load threshold, so a
// quick fetch fades straight to real content instead of flashing a
// placeholder that's about to be wrong.
const DayViewBody = ({ state }: { state: DayViewState }) => {
  const reduceMotion = useReducedMotion();
  const showSkeleton = useDelayedSkeleton(state.status === "loading");

  if (state.status === "loading") {
    return showSkeleton ? <DayViewSkeleton /> : null;
  }

  return (
    <motion.div
      initial={contentFadeInitial(reduceMotion)}
      animate={{ opacity: 1 }}
      transition={contentFadeTransition(reduceMotion)}
    >
      {state.status === "error" ? (
        <InlineMessage tone="error">Could not load this day. Please try again.</InlineMessage>
      ) : (
        <DayViewReady log={state.log} isToday={state.isToday} />
      )}
    </motion.div>
  );
};

interface DaySlideProps {
  state: DayViewState;
  reduceMotion: boolean | null;
}

// Slide timing lives in lib/motion/step-transition.ts, shared with the
// wizard. id/tabIndex are the skip link's landing target.
const DaySlide = ({ state, reduceMotion }: DaySlideProps) => (
  <motion.main
    id="main-content"
    tabIndex={-1}
    className="flex-1 px-4 py-6 focus:outline-none"
    initial={slideInitial(reduceMotion)}
    animate={{ opacity: 1, x: 0 }}
    transition={slideTransition(reduceMotion)}
  >
    <DayViewBody state={state} />
  </motion.main>
);

// Keyed on `date` so day navigation remounts DaySlide and replays its slide.
// Action bar sits outside it: stays pinned while content slides underneath.
export const DayView = ({ date }: DayViewProps) => {
  const state = useDayLog(date);
  const reduceMotion = useReducedMotion();
  const isToday = state.status === "ready" && state.isToday;

  return (
    <>
      <AppHeader variant="day" date={date} />
      <DaySlide key={date} state={state} reduceMotion={reduceMotion} />
      {isToday && <DayActionBar />}
    </>
  );
};
