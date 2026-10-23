"use client";

import { LazyMotion, MotionConfig } from "motion/react";

import { IconProvider } from "@/components/ui/icon-provider";

const loadMotionFeatures = () => import("@/lib/motion/features").then((features) => features.domMax);

// reducedMotion="user" makes every motion/react animation respect OS
// prefers-reduced-motion automatically, instead of each component checking it.
// LazyMotion keeps the animation engine out of the first-load bundle: every
// animated element is a motion/react-m component, and `strict` throws if a
// full `motion` component slips back in and drags the engine along with it.
// IconProvider sits here rather than in (app)/layout so signin/signup, which
// live outside that group, draw icons under the same size/weight contract.
export const Providers = ({ children }: { children: React.ReactNode }) => (
  <MotionConfig reducedMotion="user">
    <LazyMotion features={loadMotionFeatures} strict>
      <IconProvider>{children}</IconProvider>
    </LazyMotion>
  </MotionConfig>
);
