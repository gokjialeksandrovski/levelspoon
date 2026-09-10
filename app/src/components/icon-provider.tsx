"use client";

import { IconContext } from "@phosphor-icons/react";

// Every icon in this app is decorative: it either sits beside its own text
// label (the empty-state fork-and-knife) or inside a control that already
// carries an aria-label (the header's day-nav, the account button, the
// wizard's back arrow). None of them should reach the accessibility tree.
// Phosphor 2.x renders a bare <svg> with no aria-hidden of its own, so set
// it once here on the context rather than per icon. An icon that ever does
// need announcing can pass aria-hidden={false} with an `alt` to override
// this (found via /accessibility, 2026-09-10).
export const IconProvider = ({ children }: { children: React.ReactNode }) => (
  <IconContext.Provider value={{ size: 22, weight: "duotone", "aria-hidden": true }}>
    {children}
  </IconContext.Provider>
);
