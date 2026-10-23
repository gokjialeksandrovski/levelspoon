"use client";

import { useDelayedSkeleton } from "@/lib/motion/use-delayed-skeleton";

// The Suspense-fallback form of useDelayedSkeleton: renders its skeleton only
// once the read has outlasted the fast-load threshold.
export const DelayedFallback = ({ children }: { children: React.ReactNode }) => {
  const isShown = useDelayedSkeleton(true);
  return isShown ? children : null;
};
