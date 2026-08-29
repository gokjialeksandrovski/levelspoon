// app/src/app/meals/[mealId]/day-total-bar.tsx
"use client";

import { useEffect, useState } from "react";

import { getDayLog } from "@/actions/meals";
import type { NutritionValues } from "@/actions/products";
import { todayLocalDateString } from "@/lib/date/day-bounds";

type DayTotalState =
  | { status: "loading" }
  | { status: "error" }
  | { status: "ready"; dayTotal: NutritionValues };

const useDayTotal = (): DayTotalState => {
  const [state, setState] = useState<DayTotalState>({ status: "loading" });

  useEffect(() => {
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    getDayLog(todayLocalDateString(timezone), timezone)
      .then((log) => setState({ status: "ready", dayTotal: log.dayTotal }))
      .catch(() => setState({ status: "error" }));
  }, []);

  return state;
};

export const DayTotalBar = () => {
  const state = useDayTotal();

  if (state.status === "loading") {
    return <div className="rounded border bg-gray-50 p-3 text-sm text-gray-500">Loading today&apos;s total…</div>;
  }
  if (state.status === "error") {
    return <div className="rounded border bg-gray-50 p-3 text-sm text-red-600">Could not load today&apos;s total.</div>;
  }

  return (
    <div className="rounded border bg-gray-50 p-3 text-sm">
      <span className="font-medium">Today: </span>
      {Math.round(state.dayTotal.energyKcal)} kcal · {state.dayTotal.proteinG.toFixed(1)}g protein ·{" "}
      {state.dayTotal.carbohydrateG.toFixed(1)}g carbs · {state.dayTotal.fatG.toFixed(1)}g fat
    </div>
  );
};
