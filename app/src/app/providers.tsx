"use client";

import { MotionConfig } from "motion/react";
import { SessionProvider } from "next-auth/react";

// reducedMotion="user" makes every motion/react animation in the app -
// including Button's press-feedback spring (spec §2.5) - respect the OS
// prefers-reduced-motion setting automatically, instead of each component
// re-implementing its own useReducedMotion check.
export const Providers = ({ children }: { children: React.ReactNode }) => (
  <MotionConfig reducedMotion="user">
    <SessionProvider>{children}</SessionProvider>
  </MotionConfig>
);
