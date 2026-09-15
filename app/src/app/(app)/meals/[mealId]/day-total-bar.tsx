// app/src/app/meals/[mealId]/day-total-bar.tsx
"use client";

import { motion, useReducedMotion } from "motion/react";
import { useEffect, useState } from "react";

import { getDayLog } from "@/features/meals/actions/meals";
import { todayLocalDateString } from "@/lib/date/day-bounds";
import { contentFadeInitial, contentFadeTransition } from "@/lib/motion/step-transition";
import { useDelayedSkeleton } from "@/lib/motion/use-delayed-skeleton";

type DayTotalState =
  | { status: "loading" }
  | { status: "error" }
  | { status: "ready"; energyKcal: number };

const useDayTotal = (): DayTotalState => {
  const [state, setState] = useState<DayTotalState>({ status: "loading" });

  useEffect(() => {
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    getDayLog(todayLocalDateString(timezone), timezone)
      .then((log) => setState({ status: "ready", energyKcal: log.dayTotal.energyKcal }))
      .catch(() => setState({ status: "error" }));
  }, []);

  return state;
};

type DayTotalReadyOrErrorState = Exclude<DayTotalState, { status: "loading" }>;

// Split out of DayTotalBar purely for the line budget.
const DayTotalContent = ({ state }: { state: DayTotalReadyOrErrorState }) =>
  state.status === "error" ? (
    <span className="text-danger">Could not load today&apos;s total.</span>
  ) : (
    <>
      Today so far · <span className="tabular-nums">{Math.round(state.energyKcal)} kcal</span>
    </>
  );

// A quiet single line of context, not the boxed macro breakdown the day view
// itself owns - this is just enough to place the meal within the day's total
// while looking at it, not a second copy of the day view.
//
// Same delayed-skeleton + fade-in treatment as DayViewBody/HistoryBody
// (found via /critique, 2026-09-10) - this previously flashed "Loading…"
// the instant it mounted (which happens on every ingredient add/edit/remove,
// since meal-detail.tsx remounts it via a reloadCounter key) rather than
// skipping the flash on the common fast-refetch case.
export const DayTotalBar = () => {
  const state = useDayTotal();
  const reduceMotion = useReducedMotion();
  const showSkeleton = useDelayedSkeleton(state.status === "loading");

  if (state.status === "loading") {
    return showSkeleton ? <p className="text-sm text-text-muted">Loading today&apos;s total…</p> : null;
  }

  return (
    <motion.p
      className="text-sm text-text-muted"
      initial={contentFadeInitial(reduceMotion)}
      animate={{ opacity: 1 }}
      transition={contentFadeTransition(reduceMotion)}
    >
      <DayTotalContent state={state} />
    </motion.p>
  );
};
