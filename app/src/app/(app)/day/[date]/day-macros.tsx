// app/src/app/(app)/day/[date]/day-macros.tsx
"use client";

import { useState } from "react";

import type { NutritionValues } from "@/actions/products";

import { macroGramShares, type MacroShares } from "./day-macros.utils";

const round = (value: number): number => Math.round(value);

// Five steps, ordered smallest to largest. A five-way split of the 0-1
// share range gives visibly distinct sizes without needing more steps than
// three figures ever justify (spec §4.2's "hierarchy from type, not
// containers"). The lowest step is the legibility floor (spec §10) - even a
// near-zero share stays readable, never shrinking below text-lg. Share is
// gram-based (see day-macros.utils.ts), matching the number printed right
// next to it.
const SIZE_STEPS = ["text-lg", "text-xl", "text-2xl", "text-3xl", "text-4xl"] as const;
const SIZE_STEP_COUNT = SIZE_STEPS.length;

export const macroFigureSizeClass = (share: number): (typeof SIZE_STEPS)[number] => {
  const stepIndex = Math.min(SIZE_STEP_COUNT - 1, Math.floor(share * SIZE_STEP_COUNT));
  return SIZE_STEPS[stepIndex];
};

interface MacroFigureProps {
  label: string;
  grams: number;
  share: number;
  accentClass: string;
}

// P/C/F label stays adjacent to every figure unconditionally - the
// colorblind-redundancy requirement from spec §3.4 applied directly, since
// three adjacent accent-coded figures is the worst case for accents
// converging for someone who can't distinguish hue at all.
const MacroFigure = ({ label, grams, share, accentClass }: MacroFigureProps) => (
  <span className={`font-display font-semibold ${macroFigureSizeClass(share)} ${accentClass}`}>
    {label} {grams}g
  </span>
);

const PERCENT_SCALE = 100;
const segmentWidth = (share: number): string => `${share * PERCENT_SCALE}%`;

// The rule always spans the full width and is a composition of the day's
// calories, never a fill toward a target - there is no target concept in
// this app (spec §9), and a full-width tri-color bar reading as an
// incomplete-quantity fill was explicitly rejected in the day-view design
// pass (spec §4.2).
//
// No minimum-segment-width floor: a macro at a very small share renders as
// a proportionally thin sliver rather than being padded up to a visible
// minimum. Spec §10 leaves this open deliberately ("whether the segmented
// rule needs a minimum segment width, or whether a sub-threshold macro's
// segment drops out entirely") - resolve it here only if real data makes a
// sliver actually look broken, not preemptively.
const SegmentedRule = ({ shares }: { shares: MacroShares }) => (
  <div className="mt-2 flex h-1 w-full overflow-hidden rounded-full" role="presentation">
    <div className="bg-accent-protein" style={{ width: segmentWidth(shares.protein) }} />
    <div className="bg-accent-carbs" style={{ width: segmentWidth(shares.carbs) }} />
    <div className="bg-accent-fat" style={{ width: segmentWidth(shares.fat) }} />
  </div>
);

const ExpandedLine = ({ total }: { total: NutritionValues }) => (
  <p className="mt-1 text-sm tabular-nums text-text-muted">
    Sugars {round(total.sugarsG)}g · Saturates {round(total.saturatesG)}g · Salt {total.saltG.toFixed(1)}g
  </p>
);

interface MacroFiguresProps {
  total: NutritionValues;
  shares: MacroShares;
  expanded: boolean;
  onToggle: () => void;
}

// The tap-to-toggle affordance: the whole P/C/F line is the button, and its
// own aria-expanded state (not a separate chevron) communicates whether the
// expanded sugars/saturates/salt line is showing.
const MacroFigures = ({ total, shares, expanded, onToggle }: MacroFiguresProps) => (
  <button type="button" onClick={onToggle} aria-expanded={expanded} className="flex items-baseline gap-4 text-left">
    <MacroFigure label="P" grams={round(total.proteinG)} share={shares.protein} accentClass="text-accent-protein" />
    <MacroFigure label="C" grams={round(total.carbohydrateG)} share={shares.carbs} accentClass="text-accent-carbs" />
    <MacroFigure label="F" grams={round(total.fatG)} share={shares.fat} accentClass="text-accent-fat" />
  </button>
);

// A day with no meals has no shape to show - the macro line and rule
// collapse entirely rather than rendering a zero-width bar or a flat grey
// placeholder (spec §4.2's empty state).
export const DayMacros = ({ total }: { total: NutritionValues }) => {
  const [expanded, setExpanded] = useState(false);
  const shares = macroGramShares(total);
  const hasAnyMacros = shares.protein + shares.carbs + shares.fat > 0;

  if (!hasAnyMacros) {
    return null;
  }

  const toggleExpanded = () => setExpanded((value) => !value);

  return (
    <div className="mt-4">
      <MacroFigures total={total} shares={shares} expanded={expanded} onToggle={toggleExpanded} />
      <SegmentedRule shares={shares} />
      {expanded && <ExpandedLine total={total} />}
    </div>
  );
};
