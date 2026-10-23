"use client";

import * as motion from "motion/react-m";

// Any figure that re-renders in place on a data change (a meal total, a day
// hero, a goal preview) replays a short fade+rise instead of snapping
// straight to the new value - DESIGN.md's first motion principle ("a
// number settling").
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
