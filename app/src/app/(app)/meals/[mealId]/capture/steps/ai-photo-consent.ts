// Per-device (localStorage), not per-account - a server-recorded, auditable
// consent belongs with the cloud work (M4).
//
// Read only from event handlers, never during render, so no SSR/hydration
// branch to worry about.

const AI_PHOTO_CONSENT_KEY = "per100:ai-photo-consent";
const ACCEPTED_VALUE = "accepted";

export const hasAcceptedAiPhotoConsent = (): boolean => {
  try {
    return localStorage.getItem(AI_PHOTO_CONSENT_KEY) === ACCEPTED_VALUE;
  } catch {
    // Private mode / storage disabled - treat as not accepted so the terms
    // are shown again rather than silently skipped.
    return false;
  }
};

export const recordAiPhotoConsent = (): void => {
  try {
    localStorage.setItem(AI_PHOTO_CONSENT_KEY, ACCEPTED_VALUE);
  } catch {
    // Nothing to persist to; the user will be re-prompted next time.
  }
};
