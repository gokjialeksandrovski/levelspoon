"use client";

import { useSyncExternalStore } from "react";
import { MoonIcon, SunIcon } from "@phosphor-icons/react";

import {
  getServerSystemSchemeSnapshot,
  getServerThemeSnapshot,
  getSystemSchemeSnapshot,
  getThemeSnapshot,
  setTheme,
  subscribeToSystemScheme,
  subscribeToTheme,
} from "@/lib/theme/theme";
import { ICON_TAP_TARGET_CLASS } from "@/components/ui/tap-target";

export const ThemeToggle = () => {
  const mode = useSyncExternalStore(subscribeToTheme, getThemeSnapshot, getServerThemeSnapshot);
  const systemPrefersDark = useSyncExternalStore(
    subscribeToSystemScheme,
    getSystemSchemeSnapshot,
    getServerSystemSchemeSnapshot,
  );
  const isDark = mode === "dark" || (mode === "system" && systemPrefersDark);
  const Icon = isDark ? MoonIcon : SunIcon;

  return (
    <button
      type="button"
      onClick={() => setTheme(isDark ? "light" : "dark")}
      aria-label={`Theme: ${isDark ? "dark" : "light"}. Tap to change.`}
      className={ICON_TAP_TARGET_CLASS}
    >
      <Icon />
    </button>
  );
};
