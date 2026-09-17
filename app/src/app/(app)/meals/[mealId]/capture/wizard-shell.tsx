"use client";

import { CaretLeftIcon, XIcon } from "@phosphor-icons/react";

import { ICON_ROW_EDGE_PULL_LEFT, ICON_TAP_TARGET_CLASS } from "@/components/ui/tap-target";

interface WizardShellProps {
  title: string;
  progress: number; // 0..1, approximate
  onBack: () => void;
  exits: boolean;
  children: React.ReactNode;
}

const PERCENT = 100;

// Real progressbar so its value reaches assistive tech. Deliberately coarse
// (rounded, "adding this ingredient" not "step 3 of 5") - the number is
// momentum, not an exact step count.
const ProgressRail = ({ progress }: { progress: number }) => (
  <div
    className="h-0.5 bg-surface-raised"
    role="progressbar"
    aria-label="Progress adding this ingredient"
    aria-valuemin={0}
    aria-valuemax={PERCENT}
    aria-valuenow={Math.round(progress * PERCENT)}
  >
    {/* scaleX, not width: a width transition re-runs layout every frame. */}
    <div
      className="size-full origin-left bg-text transition-transform duration-(--duration-step) ease-out-quart"
      style={{ transform: `scaleX(${progress})` }}
    />
  </div>
);

// On the first step the same control leaves the wizard, so it says so: a
// close glyph and name, not a chevron that promises one step back.
const BackButton = ({ onBack, exits }: { onBack: () => void; exits: boolean }) => (
  <button
    type="button"
    onClick={onBack}
    aria-label={exits ? "Close" : "Back"}
    className={`${ICON_TAP_TARGET_CLASS} ${ICON_ROW_EDGE_PULL_LEFT} translate-y-px`}
  >
    {/* Regular, not the app-wide duotone: duotone X fills a tinted square behind the cross. */}
    {/* translate-y-px: geometric center reads high next to baseline-anchored text - optical nudge. */}
    {exits ? <XIcon weight="regular" /> : <CaretLeftIcon />}
  </button>
);

// Not AppHeader's "back" variant: this back control pops a step rather than
// navigating. Row and rail sit together in <header> so the progressbar is
// inside a landmark, not orphaned between header and main.
export const WizardShell = ({ title, progress, onBack, exits, children }: WizardShellProps) => (
  <div className="flex min-h-dvh flex-col">
    <header>
      <div className="flex h-16 items-center gap-1 border-b border-border px-4">
        <BackButton onBack={onBack} exits={exits} />
        <h1 className="font-display text-xl font-semibold">{title}</h1>
      </div>
      <ProgressRail progress={progress} />
    </header>
    <main id="main-content" tabIndex={-1} className="flex-1 px-4 py-6 focus:outline-none">
      {children}
    </main>
  </div>
);
