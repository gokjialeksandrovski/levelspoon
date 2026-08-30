// app/src/app/meals/[mealId]/day-total-bar.tsx
"use client";

import { useEffect, useState } from "react";

import { getDayLog } from "@/actions/meals";
import { todayLocalDateString } from "@/lib/date/day-bounds";

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

// A quiet single line of context, not the boxed macro breakdown the day view
// itself owns - this is just enough to place the meal within the day's total
// while looking at it, not a second copy of the day view.
export const DayTotalBar = () => {
  const state = useDayTotal();

  if (state.status === "loading") {
    return <p className="text-sm text-text-muted">Loading today&apos;s total…</p>;
  }
  if (state.status === "error") {
    return <p className="text-sm text-danger">Could not load today&apos;s total.</p>;
  }

  return (
    <p className="text-sm text-text-muted">
      Today so far · <span className="tabular-nums">{Math.round(state.energyKcal)} kcal</span>
    </p>
  );
};
