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

// Exposed as a real progressbar so its value reaches assistive tech, not
// just the eye. Deliberately coarse (aria-valuenow is rounded, the label
// says "adding this ingredient" not "step 3 of 5") because the underlying
// number is momentum, not an exact step count (found via /accessibility,
// 2026-09-10).
const ProgressRail = ({ progress }: { progress: number }) => (
  <div
    className="h-0.5 bg-surface-raised"
    role="progressbar"
    aria-label="Progress adding this ingredient"
    aria-valuemin={0}
    aria-valuemax={PERCENT}
    aria-valuenow={Math.round(progress * PERCENT)}
  >
    <div
      className="h-full bg-text transition-[width] duration-(--duration-step)"
      style={{ width: `${progress * PERCENT}%` }}
    />
  </div>
);

// Not AppHeader's "back" variant: the wizard's back control pops a step
// rather than navigating, and the header carries a progress rail underneath.
// The step title is this screen's h1, so each step's own <h2> instruction
// nests under it cleanly (found via /accessibility, 2026-09-10).
export const WizardShell = ({ title, progress, onBack, children }: WizardShellProps) => (
  <div className="flex min-h-[100dvh] flex-col">
    {/* Row and rail together in the banner so the progressbar sits inside a
        landmark (axe: region), not orphaned between header and main. */}
    <header>
      <div className="flex h-16 items-center gap-1 border-b border-border px-4">
        <button type="button" onClick={onBack} aria-label="Back" className={ICON_TAP_TARGET_CLASS}>
          <CaretLeft />
        </button>
        <h1 className="text-sm font-medium">{title}</h1>
      </div>
      <ProgressRail progress={progress} />
    </header>
    <main id="main-content" tabIndex={-1} className="flex-1 px-4 py-6 focus:outline-none">
      {children}
    </main>
  </div>
);
