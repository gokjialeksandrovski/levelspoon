// A firm dual-tap pop (spec §2.6): two short pulses with a brief gap,
// rather than one long buzz - matches the "reward," not "alert," feeling.
const TAP_DURATION_MS = 40;
const GAP_DURATION_MS = 30;
const LOG_SUCCESS_PATTERN_MS = [TAP_DURATION_MS, GAP_DURATION_MS, TAP_DURATION_MS];

const supportsVibration = (): boolean =>
  typeof navigator !== "undefined" && typeof navigator.vibrate === "function";

// iOS Safari has no Vibration API at all, including installed PWAs (spec
// §2.6) - this is a progressive enhancement, silently absent there, never a
// thrown error or a console warning about an unsupported feature.
export const triggerLogSuccessHaptic = (): void => {
  if (!supportsVibration()) {
    return;
  }
  navigator.vibrate(LOG_SUCCESS_PATTERN_MS);
};
