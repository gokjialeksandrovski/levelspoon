// Shared by the day view and history: both used to show a skeleton shaped
// like a guess at the data, then jump-cut to the real, usually smaller
// shape the instant a fast fetch resolved. Delaying it past a threshold
// means the common fast case shows nothing and fades straight to real content.
"use client";

import { useEffect, useState } from "react";

const SKELETON_DELAY_MS = 300;

// No explicit "reset to false" branch: `isLoading &&` in the return already
// gates the result once loading ends, and both call sites run only one
// loading cycle per mount, so a stale `true` is never read again.
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
