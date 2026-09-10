// app/src/app/(app)/meals/[mealId]/capture/wizard-shell.tsx
"use client";

import { CaretLeft } from "@phosphor-icons/react";

import { ICON_TAP_TARGET_CLASS } from "@/components/tap-target";

interface WizardShellProps {
  title: string;
  progress: number; // 0..1, approximate
  onBack: () => void;
  children: React.ReactNode;
}

const PERCENT = 100;

// Not AppHeader's "back" variant: the wizard's back control pops a step
// rather than navigating, and the header carries a progress rail underneath.
export const WizardShell = ({ title, progress, onBack, children }: WizardShellProps) => (
  <div className="flex min-h-[100dvh] flex-col">
    <header className="flex h-16 items-center gap-1 border-b border-border px-4">
      <button type="button" onClick={onBack} aria-label="Back" className={ICON_TAP_TARGET_CLASS}>
        <CaretLeft />
      </button>
      <span className="text-sm font-medium">{title}</span>
    </header>
    <div className="h-0.5 bg-surface-raised">
      <div
        className="h-full bg-text transition-[width] duration-(--duration-step)"
        style={{ width: `${progress * PERCENT}%` }}
      />
    </div>
    <main className="flex-1 px-4 py-6">{children}</main>
  </div>
);
