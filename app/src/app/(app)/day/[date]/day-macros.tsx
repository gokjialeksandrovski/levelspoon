// app/src/app/(app)/day/[date]/day-macros.tsx
"use client";

import { useState } from "react";

import type { NutritionValues } from "@/actions/products";

const round = (value: number): number => Math.round(value);

const CompactLine = ({ total }: { total: NutritionValues }) => (
  <>
    P {round(total.proteinG)}g · C {round(total.carbohydrateG)}g · F {round(total.fatG)}g
  </>
);

const ExpandedLine = ({ total }: { total: NutritionValues }) => (
  <>
    P {round(total.proteinG)}g · C {round(total.carbohydrateG)}g · F {round(total.fatG)}g · Sugars{" "}
    {round(total.sugarsG)}g · Saturates {round(total.saturatesG)}g · Salt {total.saltG.toFixed(1)}g
  </>
);

// A single toggle button rather than separate expand/collapse controls -
// the whole line is the affordance, and its own text communicates the
// current state (fewer vs. more fields) without a chevron or label.
export const DayMacros = ({ total }: { total: NutritionValues }) => {
  const [expanded, setExpanded] = useState(false);

  return (
    <button
      type="button"
      onClick={() => setExpanded((value) => !value)}
      aria-expanded={expanded}
      className="mt-2 block text-left text-sm tabular-nums text-text-muted"
    >
      {expanded ? <ExpandedLine total={total} /> : <CompactLine total={total} />}
    </button>
  );
};
