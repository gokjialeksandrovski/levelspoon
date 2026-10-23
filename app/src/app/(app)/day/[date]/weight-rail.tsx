"use client";

import { useReducedMotion } from "motion/react";
import * as motion from "motion/react-m";

import { slideTransition } from "@/lib/motion/step-transition";

// h-1, matching DayMacros' segmented rule rather than CalorieBar's h-2: this
// block sits one emphasis tier below the macros, not level with the hero.
//
// No accent colour anywhere - the four accents each own one semantic role, and
// danger means over the kcal goal. bg-text on bg-border is CalorieBar's pair.
//
// role="presentation": every figure the rail encodes is printed in the line
// above it, so the rail is redundant by construction.
const MARKER_SIZE_CLASS = "size-2.5";
const PERCENT = 100;

interface WeightRailProps {
  railShare: number;
  fillShare: number;
}

export const WeightRail = ({ railShare, fillShare }: WeightRailProps) => {
  const reduceMotion = useReducedMotion();

  return (
    <div className="relative mt-2 h-1 w-full rounded-full bg-border" role="presentation">
      {/* scaleX, not width: a new reading reads as motion rather than a
          layout change, the same move CalorieBar makes. */}
      <motion.div
        className="h-full origin-left rounded-full bg-text"
        initial={false}
        animate={{ scaleX: fillShare }}
        transition={slideTransition(reduceMotion)}
      />
      {/* The marker is what a hold goal has instead of a fill, and what a
          target goal gains at the head of its fill. It rides the right edge of
          a full-width layer slid in from the left: x animates on the compositor
          where left re-lays out, and leftward overflow never adds page scroll. */}
      <motion.div
        className="absolute inset-0"
        initial={false}
        animate={{ x: `${(railShare - 1) * PERCENT}%` }}
        transition={slideTransition(reduceMotion)}
      >
        <div className={`absolute top-1/2 right-0 ${MARKER_SIZE_CLASS} translate-x-1/2 -translate-y-1/2 rounded-full bg-text ring-2 ring-bg`} />
      </motion.div>
    </div>
  );
};
