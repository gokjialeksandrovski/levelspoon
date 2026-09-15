"use client";

import { motion, useReducedMotion } from "motion/react";

const PULSE_DURATION_SECONDS = 0.15;

interface LogSuccessPulseProps {
  // Incrementing counter, not boolean: motion/react's animate prop needs the
  // value itself to change to retrigger on back-to-back saves.
  trigger: number;
}

// Non-blocking, fixed-position flash (spec §2.5) - never delays onSaved()'s
// navigation or affects layout.
// Reduced-motion renders nothing: MotionConfig only auto-gates
// transform/layout, not opacity, and the haptic in saveAmount covers feedback.
export const LogSuccessPulse = ({ trigger }: LogSuccessPulseProps) => {
  const reduceMotion = useReducedMotion();

  if (reduceMotion) {
    return null;
  }

  return (
    <motion.div
      key={trigger}
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 z-50 bg-accent-success"
      initial={{ opacity: 0.35 }}
      animate={{ opacity: 0 }}
      transition={{ duration: PULSE_DURATION_SECONDS }}
    />
  );
};
