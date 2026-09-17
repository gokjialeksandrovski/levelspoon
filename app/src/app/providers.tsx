"use client";

import { MotionConfig } from "motion/react";
import { SessionProvider } from "next-auth/react";

import { IconProvider } from "@/components/ui/icon-provider";

// reducedMotion="user" makes every motion/react animation respect OS
// prefers-reduced-motion automatically, instead of each component checking it.
// IconProvider sits here rather than in (app)/layout so signin/signup, which
// live outside that group, draw icons under the same size/weight contract.
export const Providers = ({ children }: { children: React.ReactNode }) => (
  <MotionConfig reducedMotion="user">
    <SessionProvider>
      <IconProvider>{children}</IconProvider>
    </SessionProvider>
  </MotionConfig>
);
