"use client";

import { motion } from "motion/react";

const PULSE_DURATION_SECONDS = 0.15;

interface LogSuccessPulseProps {
  // An incrementing counter, not a boolean - motion/react's animate prop
  // needs the value itself to change to retrigger, and two saves in a row
  // both need their own pulse even if the first one is still finishing.
  trigger: number;
}

// Non-blocking: this renders inline and never delays onSaved()'s
// navigation (spec §2.5, motion category 2 of 2). Fixed-position so it
// doesn't affect layout while animating.
export const LogSuccessPulse = ({ trigger }: LogSuccessPulseProps) => (
  <motion.div
    key={trigger}
    aria-hidden="true"
    className="pointer-events-none fixed inset-0 z-50 bg-accent-success"
    initial={{ opacity: 0.35 }}
    animate={{ opacity: 0 }}
    transition={{ duration: PULSE_DURATION_SECONDS }}
  />
);
