"use client";

import { MotionConfig } from "motion/react";
import type { Session } from "next-auth";
import { SessionProvider } from "next-auth/react";

import { IconProvider } from "@/components/ui/icon-provider";

// reducedMotion="user" makes every motion/react animation respect OS
// prefers-reduced-motion automatically, instead of each component checking it.
// IconProvider sits here rather than in (app)/layout so signin/signup, which
// live outside that group, draw icons under the same size/weight contract.
// The server's session seeds SessionProvider, so useSession is never empty on
// first paint: a demo user would otherwise see AI controls flash and vanish.
export const Providers = ({ session, children }: { session: Session | null; children: React.ReactNode }) => (
  <MotionConfig reducedMotion="user">
    <SessionProvider session={session}>
      <IconProvider>{children}</IconProvider>
    </SessionProvider>
  </MotionConfig>
);
