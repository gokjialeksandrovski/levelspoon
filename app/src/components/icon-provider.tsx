"use client";

import { IconContext } from "@phosphor-icons/react";

export const IconProvider = ({ children }: { children: React.ReactNode }) => (
  <IconContext.Provider value={{ size: 22, weight: "duotone" }}>{children}</IconContext.Provider>
);
