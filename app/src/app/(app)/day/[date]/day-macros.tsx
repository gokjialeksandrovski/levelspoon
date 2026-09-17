"use client";

import { CaretDownIcon } from "@phosphor-icons/react";
import { motion, useReducedMotion } from "motion/react";
import { useId, useState } from "react";

import type { NutritionValues } from "@/types/nutrition";
import { FOCUS_RING } from "@/components/ui/tap-target";

import { macroGramShares, type MacroShares } from "./day-macros.utils";

const round = (value: number): number => Math.round(value);

// Five-way split of the 0-1 share range (spec §4.2). Lowest step is the
// legibility floor (spec §10) - never shrinks below text-lg.
const SIZE_STEPS = ["text-lg", "text-xl", "text-2xl", "text-3xl", "text-4xl"] as const;
const SIZE_STEP_COUNT = SIZE_STEPS.length;

const CHEVRON_ROTATE_DURATION_SECONDS = 0.26;
const CHEVRON_OPEN_ROTATE_DEGREES = 180;
const CHEVRON_CLOSED_ROTATE_DEGREES = 0;
const CHEVRON_ICON_SIZE = 18;

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

// P/C/F label always adjacent - colorblind-redundancy requirement, spec §3.4.
const MacroFigure = ({ label, grams, share, accentClass }: MacroFigureProps) => (
  <span className={`font-display font-semibold ${macroFigureSizeClass(share)} ${accentClass}`}>
    {label} {grams}g
  </span>
);

const PERCENT_SCALE = 100;
const segmentWidth = (share: number): string => `${share * PERCENT_SCALE}%`;

// Always full-width, a composition not a fill toward a target - no target
// concept in this app (spec §9).
//
// No minimum-segment-width floor: a tiny share renders as a thin sliver
// rather than padded up. Spec §10 leaves this open; revisit only if real
// data makes a sliver look broken.
const SegmentedRule = ({ shares }: { shares: MacroShares }) => (
  <div className="mt-2 flex h-1 w-full overflow-hidden rounded-full" role="presentation">
    <div className="bg-accent-protein" style={{ width: segmentWidth(shares.protein) }} />
    <div className="bg-accent-carbs" style={{ width: segmentWidth(shares.carbs) }} />
    <div className="bg-accent-fat" style={{ width: segmentWidth(shares.fat) }} />
  </div>
);

// Always rendered so aria-controls points at a real element in both states;
// `hidden` also drops it from the a11y tree while collapsed.
const ExpandedLine = ({ total, id, expanded }: { total: NutritionValues; id: string; expanded: boolean }) => (
  <p id={id} className={`mt-1 text-sm tabular-nums text-text-muted ${expanded ? "" : "hidden"}`}>
    Sugars {round(total.sugarsG)}g · Saturates {round(total.saturatesG)}g · Salt {total.saltG.toFixed(1)}g
  </p>
);

interface MacroFiguresProps {
  total: NutritionValues;
  shares: MacroShares;
  expanded: boolean;
  detailsId: string;
  onToggle: () => void;
}

// Whole P/C/F line is the button; aria-expanded + aria-controls tell a
// screen reader what it operates.
//
// -my-2/py-2 grows the tap area to the 44px floor without growing the row -
// py-2 (16px) covers the worst case, the smallest figure (text-lg, 28px
// line-height). FOCUS_RING is the shared branded focus outline.
const MacroFigures = ({ total, shares, expanded, detailsId, onToggle }: MacroFiguresProps) => {
  const reduceMotion = useReducedMotion();

  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={expanded}
      aria-controls={detailsId}
      aria-label="Macro breakdown"
      className={`-my-2 -mx-1 flex items-baseline gap-4 rounded-control px-1 py-2 text-left transition-colors hover:bg-surface-raised active:bg-surface-raised ${FOCUS_RING}`}
    >
      <MacroFigure label="P" grams={round(total.proteinG)} share={shares.protein} accentClass="text-accent-protein" />
      <MacroFigure label="C" grams={round(total.carbohydrateG)} share={shares.carbs} accentClass="text-accent-carbs" />
      <MacroFigure label="F" grams={round(total.fatG)} share={shares.fat} accentClass="text-accent-fat" />
      {/* text-text not text-muted: muted measures 2.90:1 here, below WCAG 1.4.11's 3:1 UI-graphic floor. */}
      <motion.span
        animate={{ rotate: expanded ? CHEVRON_OPEN_ROTATE_DEGREES : CHEVRON_CLOSED_ROTATE_DEGREES }}
        transition={{ duration: reduceMotion ? 0 : CHEVRON_ROTATE_DURATION_SECONDS }}
        className="inline-flex self-center text-text"
      >
        <CaretDownIcon size={CHEVRON_ICON_SIZE} weight="bold" />
      </motion.span>
    </button>
  );
};

// No meals: collapse entirely rather than render a zero-width bar (spec §4.2).
export const DayMacros = ({ total }: { total: NutritionValues }) => {
  const [expanded, setExpanded] = useState(false);
  const detailsId = useId();
  const shares = macroGramShares(total);
  const hasAnyMacros = shares.protein + shares.carbs + shares.fat > 0;

  if (!hasAnyMacros) {
    return null;
  }

  const toggleExpanded = () => setExpanded((value) => !value);

  return (
    <div className="mt-4">
      <MacroFigures total={total} shares={shares} expanded={expanded} detailsId={detailsId} onToggle={toggleExpanded} />
      <SegmentedRule shares={shares} />
      <ExpandedLine total={total} id={detailsId} expanded={expanded} />
    </div>
  );
};
