"use client";

import { CaretDownIcon } from "@phosphor-icons/react";
import { motion, useReducedMotion } from "motion/react";
import { useId, useState } from "react";

import type { MacroValues } from "@/features/goals/actions/macro-targets.utils";
import type { NutritionValues } from "@/types/nutrition";
import { FOCUS_RING } from "@/components/ui/tap-target";

import { macroGramShares, targetShare, type MacroShares } from "./day-macros.utils";

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

// Always full-width, a composition not a fill toward a target: with no split
// set there is no target concept here (spec §9).
//
// flex-grow by share, with a 4px floor on any non-zero share: a 1g macro in
// a big meal stays a visible sliver instead of rounding to nothing, and flex
// takes the floor out of the other segments so the rule still sums to full.
const RuleSegment = ({ share, accentClass }: { share: number; accentClass: string }) => (
  <div className={`basis-0 ${share > 0 ? "min-w-1" : ""} ${accentClass}`} style={{ flexGrow: share }} />
);

const SegmentedRule = ({ shares, className = "" }: { shares: MacroShares; className?: string }) => (
  <div className={`flex h-1 w-full overflow-hidden rounded-full ${className}`} role="presentation">
    <RuleSegment share={shares.protein} accentClass="bg-accent-protein" />
    <RuleSegment share={shares.carbs} accentClass="bg-accent-carbs" />
    <RuleSegment share={shares.fat} accentClass="bg-accent-fat" />
  </div>
);

// Always rendered so aria-controls points at a real element in both states;
// `hidden` also drops it from the a11y tree while collapsed.
const ExpandedLine = ({ total, id, expanded }: { total: NutritionValues; id: string; expanded: boolean }) => (
  <p id={id} className={`mt-1 text-sm tabular-nums text-text-muted ${expanded ? "" : "hidden"}`}>
    Sugars {round(total.sugarsG)}g · Saturates {round(total.saturatesG)}g · Salt {total.saltG.toFixed(1)}g
  </p>
);

// text-text not text-muted: muted measures 2.90:1 here, below WCAG 1.4.11's 3:1 UI-graphic floor.
const Chevron = ({ expanded }: { expanded: boolean }) => {
  const reduceMotion = useReducedMotion();
  return (
    <motion.span
      animate={{ rotate: expanded ? CHEVRON_OPEN_ROTATE_DEGREES : CHEVRON_CLOSED_ROTATE_DEGREES }}
      transition={{ duration: reduceMotion ? 0 : CHEVRON_ROTATE_DURATION_SECONDS }}
      className="inline-flex self-center text-text"
    >
      <CaretDownIcon size={CHEVRON_ICON_SIZE} weight="bold" />
    </motion.span>
  );
};

interface MacroToggleProps {
  expanded: boolean;
  detailsId: string;
  onToggle: () => void;
  className: string;
  children: React.ReactNode;
}

// Whole macro line is the button; aria-expanded + aria-controls tell a
// screen reader what it operates.
//
// -my-2/py-2 grows the tap area to the 44px floor without growing the row -
// py-2 (16px) covers the worst case, the smallest figure (text-lg, 28px
// line-height). FOCUS_RING is the shared branded focus outline.
const MacroToggle = ({ expanded, detailsId, onToggle, className, children }: MacroToggleProps) => (
  <button
    type="button"
    onClick={onToggle}
    aria-expanded={expanded}
    aria-controls={detailsId}
    aria-label="Macro breakdown"
    className={`-my-2 -mx-1 rounded-control px-1 py-2 text-left transition-colors hover:bg-surface-raised active:bg-surface-raised ${FOCUS_RING} ${className}`}
  >
    {children}
    <Chevron expanded={expanded} />
  </button>
);

const CompositionFigures = ({ total, shares }: { total: NutritionValues; shares: MacroShares }) => (
  <>
    <MacroFigure label="P" grams={round(total.proteinG)} share={shares.protein} accentClass="text-accent-protein" />
    <MacroFigure label="C" grams={round(total.carbohydrateG)} share={shares.carbs} accentClass="text-accent-carbs" />
    <MacroFigure label="F" grams={round(total.fatG)} share={shares.fat} accentClass="text-accent-fat" />
  </>
);

interface MacroColumnProps {
  label: string;
  eatenG: number;
  targetG: number | null;
  textClass: string;
  fillClass: string;
}

// Figure, target, rail stacked in one column per macro: "P 131 / 210g" on one
// line does not fit three abreast at 360px. No danger colour past target - the
// accents keep their one role, and the figure states the overshoot itself. An
// untracked macro keeps its column and figure, says so, and draws no rail; the
// empty rail slot keeps the three figures on one baseline.
const MacroColumn = ({ label, eatenG, targetG, textClass, fillClass }: MacroColumnProps) => (
  <span className="flex min-w-0 flex-col">
    <span className={`font-display text-xl font-semibold tabular-nums ${textClass}`}>
      {label} {eatenG}g
    </span>
    <span className="text-sm tabular-nums text-text-muted">{targetG === null ? "no target" : `of ${targetG}g`}</span>
    <span className={`mt-2 h-1 w-full overflow-hidden rounded-full ${targetG === null ? "" : "bg-border"}`}>
      {targetG !== null && (
        <span
          className={`block size-full origin-left rounded-full motion-safe:transition-transform motion-safe:duration-300 ${fillClass}`}
          style={{ transform: `scaleX(${targetShare(eatenG, targetG)})` }}
        />
      )}
    </span>
  </span>
);

const TargetColumns = ({ total, targets }: { total: NutritionValues; targets: MacroValues }) => (
  <>
    <MacroColumn label="P" eatenG={round(total.proteinG)} targetG={targets.protein} textClass="text-accent-protein" fillClass="bg-accent-protein" />
    <MacroColumn label="C" eatenG={round(total.carbohydrateG)} targetG={targets.carbs} textClass="text-accent-carbs" fillClass="bg-accent-carbs" />
    <MacroColumn label="F" eatenG={round(total.fatG)} targetG={targets.fat} textClass="text-accent-fat" fillClass="bg-accent-fat" />
  </>
);

const useExpandable = () => {
  const [expanded, setExpanded] = useState(false);
  return { expanded, detailsId: useId(), onToggle: () => setExpanded((value) => !value) };
};

// Targets show on an empty day too - they are the plan, the same way the kcal
// bar shows at zero.
const TargetMacros = ({ total, targets }: { total: NutritionValues; targets: MacroValues }) => {
  const toggle = useExpandable();
  return (
    <div className="mt-4">
      <MacroToggle {...toggle} className="grid w-full grid-cols-[1fr_1fr_1fr_auto] items-start gap-3">
        <TargetColumns total={total} targets={targets} />
      </MacroToggle>
      <ExpandedLine total={total} id={toggle.detailsId} expanded={toggle.expanded} />
    </div>
  );
};

// No targets and no meals: collapse entirely rather than render a zero-width
// bar (spec §4.2).
const CompositionMacros = ({ total }: { total: NutritionValues }) => {
  const toggle = useExpandable();
  const shares = macroGramShares(total);

  if (shares.protein + shares.carbs + shares.fat === 0) {
    return null;
  }

  return (
    <div className="mt-4">
      <MacroToggle {...toggle} className="flex items-baseline gap-4">
        <CompositionFigures total={total} shares={shares} />
      </MacroToggle>
      <SegmentedRule shares={shares} className="mt-2" />
      <ExpandedLine total={total} id={toggle.detailsId} expanded={toggle.expanded} />
    </div>
  );
};

// targets are grams per macro, already worked out from any share of kcal.
export const DayMacros = ({ total, targets }: { total: NutritionValues; targets: MacroValues | null }) =>
  targets === null ? <CompositionMacros total={total} /> : <TargetMacros total={total} targets={targets} />;
