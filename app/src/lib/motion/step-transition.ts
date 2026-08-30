// app/src/lib/motion/step-transition.ts
//
// The one horizontal-slide recipe shared by the app's only two animated
// surfaces (the day view's prev/next swap and the capture wizard's step
// advance) - see the project's Global Constraints, which limit motion/react
// to exactly those two places. Extracted here so the second caller reuses the
// first's numbers instead of restating them.
import type { Transition } from "motion/react";

export const SLIDE_OFFSET_PX = 24;

const TRANSITION_DURATION_SECONDS = 0.26; // matches globals.css --duration-step

// Mirrors globals.css's --ease-out-quart cubic-bezier control points exactly,
// broken into named constants so neither counts as an unexplained magic number.
const EASE_OUT_QUART_X1 = 0.16;
const EASE_OUT_QUART_Y1 = 1;
const EASE_OUT_QUART_X2 = 0.3;
const EASE_OUT_QUART_Y2 = 1;
const TRANSITION_EASE: [number, number, number, number] = [
  EASE_OUT_QUART_X1,
  EASE_OUT_QUART_Y1,
  EASE_OUT_QUART_X2,
  EASE_OUT_QUART_Y2,
];

// `false` (rather than a zeroed offset) skips the enter transition entirely,
// which is what "no motion at all" means to motion/react.
export const slideInitial = (reduceMotion: boolean | null): { opacity: number; x: number } | false =>
  reduceMotion ? false : { opacity: 0, x: SLIDE_OFFSET_PX };

export const slideTransition = (reduceMotion: boolean | null): Transition =>
  reduceMotion ? { duration: 0 } : { duration: TRANSITION_DURATION_SECONDS, ease: TRANSITION_EASE };
