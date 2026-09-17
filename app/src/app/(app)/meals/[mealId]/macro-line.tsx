"use client";

import { useReducedMotion } from "motion/react";

import { SettleNumber } from "@/components/ui/settle-number";
import type { NutritionValues } from "@/types/nutrition";

type MacroLineSize = "xs" | "sm";

const TEXT_SIZE_CLASS: Record<MacroLineSize, string> = {
  xs: "text-xs",
  sm: "text-sm",
};

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
