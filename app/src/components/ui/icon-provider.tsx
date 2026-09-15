"use client";

import { IconContext } from "@phosphor-icons/react";

// Every icon here is decorative (labeled by adjacent text or its control's
// aria-label); Phosphor renders no aria-hidden by default, so set it once
// here. Override per-icon with aria-hidden={false} if one needs announcing.
export const IconProvider = ({ children }: { children: React.ReactNode }) => (
  <IconContext.Provider value={{ size: 22, weight: "duotone", "aria-hidden": true }}>
    {children}
  </IconContext.Provider>
);
