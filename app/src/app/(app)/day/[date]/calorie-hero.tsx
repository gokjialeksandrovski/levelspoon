"use client";

import { PencilSimpleIcon } from "@phosphor-icons/react";
import { useReducedMotion } from "motion/react";
import * as motion from "motion/react-m";
import dynamic from "next/dynamic";
import { useState } from "react";

import { calorieRemaining } from "@/features/goals/actions/goals.utils";
import { gramTargets, type MacroTargets } from "@/features/goals/actions/macro-targets.utils";
import { DayCalorieStat } from "@/features/meals/components/day-calorie-stat";
import { SettleNumber } from "@/components/ui/settle-number";
import { preloadSheetProps } from "@/components/ui/sheet";
import { slideTransition } from "@/lib/motion/step-transition";
import { formatNumber } from "@/lib/nutrition/format-number";
import type { FibreCoverage } from "@/lib/nutrition/totals";
import type { NutritionValues } from "@/types/nutrition";

import { DayMacros } from "./day-macros";

// Loaded on first open, not with the page: most visits never open it.
// `loading` gives the chunk its own Suspense boundary. Without one the first
// open suspends the day view's boundary, which hides the whole day.
const loadGoalSheet = () => import("./goal-sheet").then((mod) => mod.GoalSheet);
const GoalSheet = dynamic(loadGoalSheet, { loading: () => null });
const goalSheetPreload = preloadSheetProps(loadGoalSheet);

interface GoalPillProps {
  goal: number | null;
  hasTargets: boolean;
  onOpen: () => void;
}

// "Set goal" would misread for someone who chose macro targets and no kcal
// goal: they have goals, just not that one.
const pillLabel = (goal: number | null, hasTargets: boolean): string => {
  if (goal !== null) return `Goal: ${formatNumber(goal)}`;
  return hasTargets ? "Goals" : "Set goal";
};

// Sized to the pill's text-sm line; the 22px provider default would outgrow the pill.
const PILL_ICON_SIZE = 16;

// The pill is 32px tall; the transparent button around it adds -my-2/py-2 so
// the tap target reaches 48px without the pill or its row growing. Padding is
// px-2.5, not px-3: at 360px the widest realistic pair ("9,999 kcal left"
// beside "Goal: 9,999") needs every pixel to stay on one line. A goal longer
// than that is a slipped keystroke - nothing rejects it, so the pill truncates
// rather than shoving the headline figure off screen. The ring draws on the
// pill, not the invisible hit box.
const GoalPill = ({ goal, hasTargets, onOpen }: GoalPillProps) => (
  <button type="button" onClick={onOpen} {...goalSheetPreload} className="group -my-2 min-w-0 shrink py-2 focus-visible:outline-none">
    <span className="flex items-center gap-1 overflow-hidden rounded-full bg-surface-raised px-2.5 py-1.5 text-sm font-medium text-text-muted transition-colors group-hover:bg-border group-focus-visible:outline group-focus-visible:outline-2 group-focus-visible:outline-offset-2 group-focus-visible:outline-text">
      <span className="truncate">{pillLabel(goal, hasTargets)}</span>
      <PencilSimpleIcon size={PILL_ICON_SIZE} className="shrink-0" />
    </span>
  </button>
);

interface CalorieBarProps {
  share: number;
  isOver: boolean;
  reduceMotion: boolean | null;
}

// Track is always full-width; the fill's transform (not width) animates so a
// goal edit or a newly-logged meal reads as motion, not a layout jump.
const CalorieBar = ({ share, isOver, reduceMotion }: CalorieBarProps) => (
  <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-border">
    <motion.div
      className={`size-full origin-left rounded-full ${isOver ? "bg-danger" : "bg-text"}`}
      initial={false}
      animate={{ scaleX: share }}
      transition={slideTransition(reduceMotion)}
    />
  </div>
);

interface CalorieGoalProgressProps {
  consumedKcal: number;
  goal: number;
  isOver: boolean;
  reduceMotion: boolean | null;
}

// Only rendered with a goal: without one the headline already is the consumed
// total, so this line would only repeat it.
const CalorieGoalProgress = ({ consumedKcal, goal, isOver, reduceMotion }: CalorieGoalProgressProps) => (
  <>
    <p className="mt-2 text-sm text-text-muted">
      <SettleNumber value={Math.round(consumedKcal)} reduceMotion={reduceMotion} /> consumed
    </p>
    <CalorieBar share={Math.min(1, consumedKcal / goal)} isOver={isOver} reduceMotion={reduceMotion} />
  </>
);

interface GoalSheetState {
  goal: number | null;
  targets: MacroTargets | null;
  sheetOpen: boolean;
  openToken: number;
  openSheet: () => void;
  closeSheet: () => void;
  setGoals: (goal: number | null, targets: MacroTargets | null) => void;
}

// openToken is bumped on every open so GoalSheet remounts fresh each time
// (see its own comment) instead of resyncing stale edits via an effect.
const useGoalSheetState = (initialGoal: number | null, initialTargets: MacroTargets | null): GoalSheetState => {
  const [goal, setGoal] = useState(initialGoal);
  const [targets, setTargets] = useState(initialTargets);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [openToken, setOpenToken] = useState(0);

  const openSheet = (): void => {
    setOpenToken((token) => token + 1);
    setSheetOpen(true);
  };

  const setGoals = (nextGoal: number | null, nextTargets: MacroTargets | null): void => {
    setGoal(nextGoal);
    setTargets(nextTargets);
  };

  return { goal, targets, sheetOpen, openToken, openSheet, closeSheet: () => setSheetOpen(false), setGoals };
};

interface CalorieHeroProps {
  total: NutritionValues;
  fibreCoverage: FibreCoverage;
  initialGoal: number | null;
  initialTargets: MacroTargets | null;
}

// Owns the goal and targets locally (seeded from the server-fetched values) so
// saving in the sheet updates the hero the moment the save returns, before
// the route refresh that follows it lands.
// Renders DayMacros too: a share-of-kcal target needs the kcal goal to become
// grams, and both live here.
export const CalorieHero = ({ total, fibreCoverage, initialGoal, initialTargets }: CalorieHeroProps) => {
  const { goal, targets, sheetOpen, openToken, openSheet, closeSheet, setGoals } = useGoalSheetState(initialGoal, initialTargets);
  const consumedKcal = total.energyKcal;
  const reduceMotion = useReducedMotion();
  const remaining = calorieRemaining(goal, consumedKcal);

  return (
    <div>
      {/* Pill sits beside the number in every state, so setting a goal only adds lines below and nothing moves sideways. */}
      <div className="flex items-center justify-between gap-2">
        <DayCalorieStat consumedKcal={consumedKcal} remaining={remaining} reduceMotion={reduceMotion} />
        <GoalPill goal={goal} hasTargets={targets !== null} onOpen={openSheet} />
      </div>
      {goal !== null && (
        <CalorieGoalProgress consumedKcal={consumedKcal} goal={goal} isOver={remaining.status === "over"} reduceMotion={reduceMotion} />
      )}
      <DayMacros total={total} fibreCoverage={fibreCoverage} targets={targets === null ? null : gramTargets(targets, goal)} />
      {openToken > 0 && (
        <GoalSheet
          key={openToken}
          open={sheetOpen}
          initialGoal={goal}
          initialTargets={targets}
          onClose={closeSheet}
          onSaved={setGoals}
        />
      )}
    </div>
  );
};
