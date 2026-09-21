// app/src/app/(app)/day/[date]/weigh-in-dismissal.ts
// Per-device (localStorage), like per100:ai-photo-consent. Dismissing a prompt
// is not a fact about the account, and a server round trip to say "not now"
// would be a write the exit is supposed to avoid.
//
// Read only from event handlers and effects, never during render, so there is
// no SSR/hydration branch.
const dismissalKey = (date: string): string => `per100:weigh-in-dismissed:${date}`;

export const isWeighInDismissed = (date: string): boolean => {
  try {
    return localStorage.getItem(dismissalKey(date)) !== null;
  } catch {
    // Private mode or storage disabled: show the prompt rather than silently
    // hiding it.
    return false;
  }
};

// Keyed per day, so a new day gets a new key and nothing needs clearing.
export const dismissWeighIn = (date: string): void => {
  try {
    localStorage.setItem(dismissalKey(date), "1");
  } catch {
    // Nothing to persist to; the prompt returns on the next render.
  }
};
