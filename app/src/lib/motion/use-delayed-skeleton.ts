// app/src/lib/motion/use-delayed-skeleton.ts
//
// Shared by the day view and history's loading states (found via a
// throttled Playwright repro, 2026-09-09): both used to show a skeleton
// shaped like a guess at the data (3 meal rows, 6 history rows) that
// snapped to the real, usually smaller shape the instant a fast local fetch
// resolved - a jump-cut, not a loading state. Delaying the skeleton past
// ui-ux-pro-max's loading-states threshold means the common fast case shows
// nothing at all and fades straight to real content instead.
"use client";

import { useEffect, useState } from "react";

const SKELETON_DELAY_MS = 300;

// No explicit "reset to false" branch - only the timeout's own callback
// ever calls setShowSkeleton, matching this codebase's existing
// no-synchronous-reset precedent (see day-view.tsx's useDayLog). The
// `isLoading &&` in the return already gates the result correctly once
// loading ends; both current call sites only ever run one loading cycle per
// mount, so a stale `true` from a finished cycle is never read again.
export const useDelayedSkeleton = (isLoading: boolean): boolean => {
  const [showSkeleton, setShowSkeleton] = useState(false);

  useEffect(() => {
    if (!isLoading) {
      return;
    }
    const timer = setTimeout(() => setShowSkeleton(true), SKELETON_DELAY_MS);
    return () => clearTimeout(timer);
  }, [isLoading]);

  return isLoading && showSkeleton;
};
