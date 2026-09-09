// app/src/lib/motion/step-transition.ts
//
// The one horizontal-slide recipe shared by two of the app's four
// motion/react surfaces - the day view's prev/next swap and the capture
// wizard's step advance, both pre-existing; the 2026-09-05 re-theme added
// two more (Button's press-feedback spring, LogSuccessPulse's log-success
// pulse) that don't need this shared recipe - see the design spec's §2.5.
// Extracted here so the second caller reuses the first's numbers instead of
// restating them.
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

// A second, quieter recipe for content that resolves *inside* an
// already-moving surface (a loading state swapping to real data) - the day
// view and history's loading→ready swap, both added 2026-09-09 alongside
// useDelayedSkeleton. Deliberately shorter than the slide above and
// opacity-only: ui-ux-pro-max's exit-faster-than-enter rule puts an
// inner event at ~60-70% of the surface's own entrance (0.18/0.26 ≈ 69%).
const CONTENT_FADE_DURATION_SECONDS = 0.18;

export const contentFadeInitial = (reduceMotion: boolean | null): { opacity: number } | false =>
  reduceMotion ? false : { opacity: 0 };

export const contentFadeTransition = (reduceMotion: boolean | null): Transition =>
  reduceMotion ? { duration: 0 } : { duration: CONTENT_FADE_DURATION_SECONDS };
