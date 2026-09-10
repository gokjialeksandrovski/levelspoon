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

// Only the kcal stat placeholder - the one piece of the ready state whose
// size never depends on the day's data. This used to also mock a macro line
// and three meal rows, but that guessed shape collapsed by ~300px the
// instant real (often emptier) data arrived, mid-slide - a jump-cut, not a
// loading state (found via a throttled Playwright repro, 2026-09-09). Real
// content fades in on its own below this once it resolves - see
// DayViewBody's contentFade*.
const DayViewSkeleton = () => <Skeleton className="h-11 w-32" />;

const DayViewReady = ({ log, isToday }: { log: DayLog; isToday: boolean }) => (
  <>
    <Stat value={Math.round(log.dayTotal.energyKcal).toLocaleString()} unit="kcal" />
    <DayMacros total={log.dayTotal} />
    {log.meals.length === 0 ? <DayEmptyState isToday={isToday} /> : <MealList meals={log.meals} />}
  </>
);

// Skeleton only appears past useDelayedSkeleton's fast-load threshold, so
// the common case (a local fetch resolving in well under 300ms) shows
// nothing at all and fades straight to real content instead of flashing a
// placeholder that's about to be wrong. Resolved content fades in
// (contentFade*) rather than snapping in, so whatever size difference
// remains between "nothing yet" and the day's actual data reads as a soft
// entrance, not a jump - this component only mounts once loading ends, so
// motion's `initial` fires on that first appearance without needing a key.
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

// One of two pre-existing places in the app using motion/react (the other
// is the capture wizard); the 2026-09-05 re-theme added two more (Button's
// press-feedback spring, LogSuccessPulse's log-success pulse), for four
// total - see the design spec's §2.5. The slide's own numbers live in
// lib/motion/step-transition.ts, shared with the wizard. id/tabIndex are
// the skip link's landing target.
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

// DaySlide is keyed on `date` so prev/next navigation remounts it and its
// `initial` slide replays; `useReducedMotion` collapses that to an instant,
// motion-free swap. The action bar sits outside it deliberately: it must
// stay pinned while the day's content scrolls and slides underneath, and it
// only exists for today - there is no way to log into the past.
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
