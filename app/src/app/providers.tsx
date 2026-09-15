"use client";

import { MotionConfig } from "motion/react";
import { SessionProvider } from "next-auth/react";

// reducedMotion="user" makes every motion/react animation respect OS
// prefers-reduced-motion automatically, instead of each component checking it.
export const Providers = ({ children }: { children: React.ReactNode }) => (
  <MotionConfig reducedMotion="user">
    <SessionProvider>{children}</SessionProvider>
  </MotionConfig>
);
