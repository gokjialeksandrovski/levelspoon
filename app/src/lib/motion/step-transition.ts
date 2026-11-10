// Shared horizontal-slide recipe for the day view's prev/next swap and the
// capture wizard's step advance (design spec §2.5), so the second caller
// reuses the first's numbers instead of restating them.
import type { Transition } from "motion/react";

const SLIDE_OFFSET_PX = 24;

const TRANSITION_DURATION_SECONDS = 0.26; // matches globals.css --duration-step

// Mirrors globals.css's --ease-out-quart cubic-bezier control points exactly.
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

// Quieter recipe for content resolving *inside* an already-moving surface
// (a loading→ready swap). Deliberately shorter and opacity-only: an inner
// event should land at ~60-70% of the surface's own entrance (0.18/0.26 ≈ 69%).
const CONTENT_FADE_DURATION_SECONDS = 0.18;

export const contentFadeInitial = (reduceMotion: boolean | null): { opacity: number } | false =>
  reduceMotion ? false : { opacity: 0 };

export const contentFadeTransition = (reduceMotion: boolean | null): Transition =>
  reduceMotion ? { duration: 0 } : { duration: CONTENT_FADE_DURATION_SECONDS };

// List entrance shared by the meal-detail ingredient list and the day's meal
// list: the parent staggers, each row rises. Both keep the "hidden"/"visible"
// keys so the parent's orchestration reaches the rows.
// 30-50ms per-row stagger per the motion spec; 40ms sits at the mid-point.
const ROW_STAGGER_SECONDS = 0.04;
const ROW_ENTER_OFFSET_PX = 8;
const ROW_TRANSITION_SECONDS = 0.22;

export const listStaggerVariants = {
  hidden: {},
  visible: { transition: { staggerChildren: ROW_STAGGER_SECONDS } },
};

export const rowEnterVariants = {
  hidden: { opacity: 0, y: ROW_ENTER_OFFSET_PX },
  visible: { opacity: 1, y: 0, transition: { duration: ROW_TRANSITION_SECONDS } },
};
