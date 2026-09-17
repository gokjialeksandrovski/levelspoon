"use client";

import { motion, useReducedMotion } from "motion/react";
import { useState } from "react";

import { calorieRemaining, type CalorieRemaining, type CalorieRemainingStatus } from "@/features/goals/actions/goals.utils";
import { SettleNumber } from "@/components/ui/settle-number";
import { Stat, type StatTone } from "@/components/ui/stat";
import { FOCUS_RING } from "@/components/ui/tap-target";
import { slideTransition } from "@/lib/motion/step-transition";

import { GoalSheet } from "./goal-sheet";

const HERO_UNIT: Record<CalorieRemainingStatus, string> = {
  unset: "kcal",
  left: "kcal left",
  over: "kcal over",
};

const HERO_TONE: Record<CalorieRemainingStatus, StatTone> = {
  unset: "default",
  left: "default",
  over: "danger",
};

const heroValue = (remaining: CalorieRemaining, consumedKcal: number): number =>
  remaining.status === "unset" ? Math.round(consumedKcal) : remaining.kcal;

interface GoalPillProps {
  goal: number | null;
  onOpen: () => void;
}

const GoalPill = ({ goal, onOpen }: GoalPillProps) => (
  <button
    type="button"
    onClick={onOpen}
    className={`flex items-center gap-1 rounded-full bg-surface-raised px-3 py-1.5 text-xs font-medium text-text-muted transition-colors hover:bg-border ${FOCUS_RING}`}
  >
    {goal === null ? "Set goal" : `Goal: ${goal.toLocaleString()}`}
    <span aria-hidden="true">✏️</span>
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

interface CalorieSecondaryRowProps {
  consumedKcal: number;
  goal: number | null;
  reduceMotion: boolean | null;
  onOpenSheet: () => void;
}

const CalorieSecondaryRow = ({ consumedKcal, goal, reduceMotion, onOpenSheet }: CalorieSecondaryRowProps) => (
  <div className="mt-2 flex items-center justify-between gap-2">
    <p className="text-sm text-text-muted">
      <SettleNumber value={Math.round(consumedKcal)} reduceMotion={reduceMotion} /> consumed
    </p>
    <GoalPill goal={goal} onOpen={onOpenSheet} />
  </div>
);

interface GoalSheetState {
  goal: number | null;
  sheetOpen: boolean;
  openToken: number;
  openSheet: () => void;
  closeSheet: () => void;
  setGoal: (goal: number) => void;
}

// openToken is bumped on every open so GoalSheet remounts fresh each time
// (see its own comment) instead of resyncing stale edits via an effect.
const useGoalSheetState = (initialGoal: number | null): GoalSheetState => {
  const [goal, setGoal] = useState(initialGoal);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [openToken, setOpenToken] = useState(0);

  const openSheet = (): void => {
    setOpenToken((token) => token + 1);
    setSheetOpen(true);
  };

  return { goal, sheetOpen, openToken, openSheet, closeSheet: () => setSheetOpen(false), setGoal };
};

interface CalorieHeroProps {
  consumedKcal: number;
  initialGoal: number | null;
}

// Owns the goal locally (seeded from the server-fetched value) so saving in
// the sheet updates the hero immediately, with no full day refetch.
export const CalorieHero = ({ consumedKcal, initialGoal }: CalorieHeroProps) => {
  const { goal, sheetOpen, openToken, openSheet, closeSheet, setGoal } = useGoalSheetState(initialGoal);
  const reduceMotion = useReducedMotion();
  const remaining = calorieRemaining(goal, consumedKcal);
  const share = goal === null ? 0 : Math.min(1, consumedKcal / goal);

  return (
    <div>
      <Stat
        value={heroValue(remaining, consumedKcal).toLocaleString()}
        unit={HERO_UNIT[remaining.status]}
        tone={HERO_TONE[remaining.status]}
      />
      <CalorieSecondaryRow consumedKcal={consumedKcal} goal={goal} reduceMotion={reduceMotion} onOpenSheet={openSheet} />
      {goal !== null && <CalorieBar share={share} isOver={remaining.status === "over"} reduceMotion={reduceMotion} />}
      <GoalSheet key={openToken} open={sheetOpen} initialGoal={goal} onClose={closeSheet} onSaved={setGoal} />
    </div>
  );
};
