"use client";

import { motion, useReducedMotion } from "motion/react";

import type { NutritionValues } from "@/types/nutrition";

type MacroLineSize = "xs" | "sm";

const TEXT_SIZE_CLASS: Record<MacroLineSize, string> = {
  xs: "text-xs",
  sm: "text-sm",
};

// Meal total's numbers re-render in place on every add/edit/remove -
// `.impeccable.md`'s own named motion gap ("a number settling"). Keying on
// the value remounts the span and replays a short fade+rise instead of
// snapping straight to the new figure.
const SETTLE_OFFSET_PX = 4;
const SETTLE_DURATION_SECONDS = 0.18;

// string values allowed for a figure that carries its own fixed formatting
// (e.g. salt's 1-decimal-place display), where Math.round would be wrong.
export const SettleNumber = ({ value, reduceMotion }: { value: number | string; reduceMotion: boolean | null }) =>
  reduceMotion ? (
    <>{value}</>
  ) : (
    <motion.span
      key={value}
      initial={{ opacity: 0, y: -SETTLE_OFFSET_PX }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: SETTLE_DURATION_SECONDS }}
      className="inline-block"
    >
      {value}
    </motion.span>
  );

interface MacroLineProps {
  contribution: NutritionValues;
  size?: MacroLineSize;
  // Meal total only: a per-row line doesn't jump in place the way the total does.
  animate?: boolean;
}

// Flat P/C/F text, no scaling-by-share or segmented bar - that headline
// treatment is DayView's own signature (day-macros.tsx) and stays there so
// it doesn't get diluted by repeating at every meal/ingredient level.
export const MacroLine = ({ contribution, size = "xs", animate = false }: MacroLineProps) => {
  const reduceMotion = useReducedMotion();
  const protein = Math.round(contribution.proteinG);
  const carbs = Math.round(contribution.carbohydrateG);
  const fat = Math.round(contribution.fatG);

  return (
    <p className={`tabular-nums text-text-muted ${TEXT_SIZE_CLASS[size]}`}>
      <span className="text-accent-protein">P {animate ? <SettleNumber value={protein} reduceMotion={reduceMotion} /> : protein}g</span>
      {" · "}
      <span className="text-accent-carbs">C {animate ? <SettleNumber value={carbs} reduceMotion={reduceMotion} /> : carbs}g</span>
      {" · "}
      <span className="text-accent-fat">F {animate ? <SettleNumber value={fat} reduceMotion={reduceMotion} /> : fat}g</span>
    </p>
  );
};
