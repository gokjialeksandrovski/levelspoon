"use client";

import { LazyMotion, MotionConfig } from "motion/react";
import type { Session } from "next-auth";
import { SessionProvider } from "next-auth/react";

import { IconProvider } from "@/components/ui/icon-provider";

const loadMotionFeatures = () => import("@/lib/motion/features").then((features) => features.domMax);

// reducedMotion="user" makes every motion/react animation respect OS
// prefers-reduced-motion automatically, instead of each component checking it.
// LazyMotion keeps the animation engine out of the first-load bundle: every
// animated element is a motion/react-m component, and `strict` throws if a
// full `motion` component slips back in and drags the engine along with it.
// IconProvider sits here rather than in (app)/layout so signin/signup, which
// live outside that group, draw icons under the same size/weight contract.
// The server's session seeds SessionProvider, so useSession is never empty on
// first paint: a demo user would otherwise see AI controls flash and vanish.
export const Providers = ({ session, children }: { session: Session | null; children: React.ReactNode }) => (
  <MotionConfig reducedMotion="user">
    <LazyMotion features={loadMotionFeatures} strict>
      <SessionProvider session={session}>
        <IconProvider>{children}</IconProvider>
      </SessionProvider>
    </LazyMotion>
  </MotionConfig>
);
