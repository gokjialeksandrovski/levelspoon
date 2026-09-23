"use client";

import { CaretRightIcon, MinusCircleIcon, PlusCircleIcon, type Icon } from "@phosphor-icons/react";
import Link from "next/link";
import { useId, useState } from "react";

import { saveDailyGoals } from "@/features/goals/actions/goals";
import {
  commitGoalDraft,
  DEFAULT_CALORIE_GOAL,
  isUnusableGoalDraft,
  isValidCalorieGoal,
  nudgeCalorieGoal,
} from "@/features/goals/actions/goals.utils";
import type { MacroTargets, MacroTargetUnit } from "@/features/goals/actions/macro-targets.utils";
import { Button } from "@/components/ui/button";
import { InlineMessage } from "@/components/ui/inline-message";
import { Sheet } from "@/components/ui/sheet";

import { MacroTargetsFields, useMacroTargetsDraft, type MacroTargetsDraftState } from "./macro-targets-fields";

const SMALL_NUDGE = 100;
const LARGE_NUDGE = 500;
// Symmetrical pairs, coarse outside fine, so the row reads as one scale left to
// right. There is no reset-to-2000 chip: a flat number on a button would be an
// intake recommendation with nothing behind it. The estimate page linked below
// is the one place a figure comes with its working. Typing is how you jump
// anywhere.
const GOAL_NUDGES = [-LARGE_NUDGE, -SMALL_NUDGE, SMALL_NUDGE, LARGE_NUDGE] as const;

interface GoalNumberInputProps {
  draft: string;
  openingGoal: number;
  hasMoved: boolean;
  onType: (draft: string) => void;
  onCommit: () => void;
  onSubmit: () => void;
}

// w-48, not w-full: the field holds four glyphs, and a full-width box put its
// focus ring flush against the scroll container's clip edge - 4px wider than
// every control below it, with nothing left of the gutter Sheet reserves for
// offset rings. A ring that spans the sheet also stops reading as a ring and
// starts reading as a border the rest state forgot to draw. 192px still holds
// eight digits; a longer one is a slipped keystroke and scrolls.
// surface-raised at rest, not transparent: an unbordered figure is
// typographically a Stat, so nothing said the number could be typed over, and
// typing is the only way to reach a target the chips cannot step to.
// It carries no min, max or step - each of those is a rule about what target
// is allowed, and the whole point here is that there is none. Native spinners
// are stripped: they draw a pair of browser-grey arrows through a display-face
// figure, and the chips below step the value.
const GoalNumberInput = ({ draft, openingGoal, hasMoved, onType, onCommit, onSubmit }: GoalNumberInputProps) => {
  const captionId = useId();

  return (
    <div className="flex flex-col gap-1">
      <input
        type="number"
        inputMode="numeric"
        value={draft}
        aria-label="Daily calorie goal"
        aria-describedby={captionId}
        onChange={(event) => onType(event.target.value)}
        onBlur={onCommit}
        // Enter saves. Without it the primary action costs four Tab stops past
        // the chips, and a phone keyboard's return key does nothing at all.
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            onSubmit();
          }
        }}
        className="mx-auto block w-48 rounded-control bg-surface-raised py-2 text-center font-display text-4xl font-semibold tabular-nums text-text [appearance:textfield] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-text [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
      />
      <p id={captionId} className="text-center text-sm text-text-muted">
        kcal per day
      </p>
      {/* The value you opened with, while the draft differs from it. Stated,
          not advised - it is the one number the sheet can name without
          recommending an intake, and without it a couple of chip taps leave
          no way back but memory. */}
      {hasMoved && (
        <p className="text-center text-sm tabular-nums text-text-muted">was {openingGoal.toLocaleString()}</p>
      )}
    </div>
  );
};

interface GoalChipsProps {
  goal: number;
  onChange: (goal: number) => void;
}

const GoalChips = ({ goal, onChange }: GoalChipsProps) => (
  <div className="flex gap-2">
    {GOAL_NUDGES.map((delta) => (
      <Button
        key={delta}
        variant="ghost"
        className="flex-1 px-0 tabular-nums"
        onClick={() => onChange(nudgeCalorieGoal(goal, delta))}
      >
        {delta > 0 ? `+${delta}` : delta}
      </Button>
    ))}
  </div>
);

type OnGoalsSaved = (goal: number | null, targets: MacroTargets | null) => void;

interface SaveDailyGoals {
  isSaving: boolean;
  hasError: boolean;
  save: (goal: number | null, targets: MacroTargets | null) => void;
}

// Isolates the pending/error dance so GoalSheet itself stays a plain layout.
const useSaveDailyGoals = (onSaved: OnGoalsSaved, onClose: () => void): SaveDailyGoals => {
  const [isSaving, setIsSaving] = useState(false);
  const [hasError, setHasError] = useState(false);

  const save = (goal: number | null, targets: MacroTargets | null): void => {
    setIsSaving(true);
    setHasError(false);
    saveDailyGoals(goal, targets)
      .then(() => {
        onSaved(goal, targets);
        onClose();
      })
      .catch(() => setHasError(true))
      .finally(() => setIsSaving(false));
  };

  return { isSaving, hasError, save };
};

interface GoalDraft {
  goal: number;
  draft: string;
  wasRejected: boolean;
  setGoal: (goal: number) => void;
  type: (draft: string) => void;
  commit: () => number;
}

// The chips and the field are two hands on one value, so the typed text keeps
// its own state: the committed goal follows as soon as a typed value is whole
// and storable, and anything half-typed stays on screen until blur resolves it.
const useGoalDraft = (initialGoal: number): GoalDraft => {
  const [goal, setGoalValue] = useState(initialGoal);
  const [draft, setDraft] = useState(String(initialGoal));
  const [wasRejected, setWasRejected] = useState(false);

  const setGoal = (next: number) => {
    setGoalValue(next);
    setDraft(String(next));
    setWasRejected(false);
  };

  const type = (next: string) => {
    setDraft(next);
    setWasRejected(false);
    const typed = Number(next);
    if (isValidCalorieGoal(typed)) {
      setGoalValue(typed);
    }
  };

  const commit = (): number => {
    const rejected = isUnusableGoalDraft(draft);
    const next = commitGoalDraft(draft, goal);
    setGoal(next);
    setWasRejected(rejected);
    return next;
  };

  return { goal, draft, wasRejected, setGoal, type, commit };
};

// The one way into the estimate (spec §2): the moment a user is holding a
// number they cannot fill. A row that says who it is for, not a bare link:
// "Not sure?" alone gave no reason to leave a half-set goal. Outlined rather
// than filled so it cannot be mistaken for a fifth nudge chip.
const EstimateLink = () => (
  <Link
    href="/calories/estimate"
    className="group flex items-center gap-3 rounded-control p-4 text-left ring-1 ring-inset ring-border transition-colors hover:bg-surface-raised focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-text"
  >
    <span className="flex flex-col gap-1">
      <span className="text-sm font-semibold text-text">Work out the numbers</span>
      <span className="text-sm text-text-muted">
        New to tracking, or want a second opinion on how much you eat? Enter your body stats and activity to see a daily
        range, and how it was worked out.
      </span>
    </span>
    <CaretRightIcon
      aria-hidden
      weight="bold"
      className="shrink-0 text-text-muted transition-transform group-hover:text-text motion-safe:group-hover:translate-x-0.5"
    />
  </Link>
);

interface GoalPresence {
  hasGoal: boolean;
  remove: () => void;
  restore: () => void;
}

// Shares need a kcal goal and grams do not, so the targets' unit follows the
// goal: removing it turns shares into grams, restoring it turns grams back
// into shares of the figure the field still holds. The field keeps that
// figure while hidden, so "Set a calorie goal" brings back what was there.
const useGoalPresence = (initialHasGoal: boolean, goalDraft: GoalDraft, targetsDraft: MacroTargetsDraftState): GoalPresence => {
  const [hasGoal, setHasGoal] = useState(initialHasGoal);

  const remove = (): void => {
    setHasGoal(false);
    targetsDraft.convertTo("g", goalDraft.goal);
  };

  const restore = (): void => {
    setHasGoal(true);
    targetsDraft.convertTo("pct", goalDraft.goal);
  };

  return { hasGoal, remove, restore };
};

interface GoalPresenceButtonProps {
  icon: Icon;
  label: string;
  onClick: () => void;
}

// Unfilled, where the nudge chips right above are filled, so it cannot read as
// a fifth step; the icon says remove/add without an underline. Raw button:
// Button's ghost recipe paints the chips' fill. min-h-11 is the tap floor.
const GoalPresenceButton = ({ icon: GlyphIcon, label, onClick }: GoalPresenceButtonProps) => (
  <button
    type="button"
    onClick={onClick}
    className="inline-flex min-h-11 items-center gap-1.5 self-center rounded-full px-4 text-sm font-medium text-text-muted transition-colors hover:bg-surface-raised hover:text-text focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-text"
  >
    <GlyphIcon aria-hidden weight="bold" className="size-4" />
    {label}
  </button>
);

interface GoalFieldGroupProps {
  goalDraft: GoalDraft;
  openingGoal: number;
  onRemove: () => void;
  onSubmit: () => void;
}

// gap-3 inside the group: the chips are a control for the number directly
// above them, and one flat gap spaced them as far from it as from the save
// action.
const GoalFieldGroup = ({ goalDraft, openingGoal, onRemove, onSubmit }: GoalFieldGroupProps) => (
  <div className="flex flex-col gap-3">
    <GoalNumberInput
      draft={goalDraft.draft}
      openingGoal={openingGoal}
      hasMoved={goalDraft.goal !== openingGoal}
      onType={goalDraft.type}
      onCommit={goalDraft.commit}
      onSubmit={onSubmit}
    />
    <GoalChips goal={goalDraft.goal} onChange={goalDraft.setGoal} />
    <GoalPresenceButton icon={MinusCircleIcon} label="No calorie goal" onClick={onRemove} />
  </div>
);

// Stated, not pleaded: the day view shows what was eaten without a target,
// and the way back is one tap.
const NoGoalNotice = ({ onRestore }: { onRestore: () => void }) => (
  <div className="flex flex-col items-center gap-1 text-center">
    <p className="font-display text-2xl font-semibold text-text">No calorie goal</p>
    <p className="text-sm text-text-muted">The day shows what you ate, with no kcal target.</p>
    <GoalPresenceButton icon={PlusCircleIcon} label="Set a calorie goal" onClick={onRestore} />
  </div>
);

interface GoalSheetBodyProps {
  goalDraft: GoalDraft;
  targetsDraft: MacroTargetsDraftState;
  presence: GoalPresence;
  openingGoal: number;
  hasError: boolean;
  onSubmit: () => void;
}

const GoalSheetBody = ({ goalDraft, targetsDraft, presence, openingGoal, hasError, onSubmit }: GoalSheetBodyProps) => (
  <div className="flex flex-col gap-6">
    {presence.hasGoal ? (
      <GoalFieldGroup goalDraft={goalDraft} openingGoal={openingGoal} onRemove={presence.remove} onSubmit={onSubmit} />
    ) : (
      <NoGoalNotice onRestore={presence.restore} />
    )}
    <MacroTargetsFields targetsDraft={targetsDraft} calorieGoal={presence.hasGoal ? goalDraft.goal : null} />
    <EstimateLink />
    {goalDraft.wasRejected && (
      <InlineMessage tone="info">That was not a number we could read, so the goal above is unchanged.</InlineMessage>
    )}
    {targetsDraft.wasBlocked && (
      <InlineMessage tone="error">
        Fix the macro targets above before saving, or clear them to save the rest.
      </InlineMessage>
    )}
    {hasError && <InlineMessage tone="error">Could not save. Please try again.</InlineMessage>}
  </div>
);

interface GoalSheetProps {
  open: boolean;
  initialGoal: number | null;
  initialTargets: MacroTargets | null;
  onClose: () => void;
  onSaved: OnGoalsSaved;
}

// First open (nothing set) shows the kcal field; a saved "no goal" is only
// ever one with macro targets beside it, so that is the one state that opens
// without the field.
const opensWithGoal = (initialGoal: number | null, initialTargets: MacroTargets | null): boolean =>
  initialGoal !== null || initialTargets === null;

// New targets start in the unit the goal allows; saved ones keep theirs. Grams
// beside a goal are valid, and are what the estimate leaves after setting one.
const opensWithUnit = (hasGoal: boolean, initialTargets: MacroTargets | null): MacroTargetUnit =>
  initialTargets?.unit ?? (hasGoal ? "pct" : "g");

// No effect resyncing tempGoal on reopen: CalorieHero remounts this whole
// component (a fresh `key` per open) instead, so state just starts clean.
export const GoalSheet = ({ open, initialGoal, initialTargets, onClose, onSaved }: GoalSheetProps) => {
  const openingGoal = initialGoal ?? DEFAULT_CALORIE_GOAL;
  const initialHasGoal = opensWithGoal(initialGoal, initialTargets);
  const goalDraft = useGoalDraft(openingGoal);
  const targetsDraft = useMacroTargetsDraft(initialTargets, opensWithUnit(initialHasGoal, initialTargets));
  const presence = useGoalPresence(initialHasGoal, goalDraft, targetsDraft);
  const { isSaving, hasError, save } = useSaveDailyGoals(onSaved, onClose);

  // Commits the draft rather than reading state: a tap on Save blurs the field
  // first, but the resulting state update is not visible to this handler yet -
  // which is also why the unusable-draft check reads the pre-blur text. Saving
  // is skipped in that case so the sheet stays open to say so, rather than
  // closing on a value the user did not type.
  const commitGoal = (): number | null | "unusable" => {
    if (!presence.hasGoal) return null;
    const next = goalDraft.commit();
    return isUnusableGoalDraft(goalDraft.draft) ? "unusable" : next;
  };

  // Targets that do not read block the whole save for the same reason:
  // storing the goal alone would drop the targets the user was visibly editing.
  const submit = () => {
    const goal = commitGoal();
    if (goal === "unusable") return;
    const { reading } = targetsDraft;
    if (reading.kind === "off" || reading.kind === "unreadable") {
      targetsDraft.block();
      return;
    }
    save(goal, reading.kind === "ready" ? reading.targets : null);
  };

  const footer = (
    <Button variant="primary" className="w-full" pending={isSaving} onClick={submit}>
      Save goals
    </Button>
  );

  return (
    <Sheet open={open} onClose={onClose} title="Daily goals" footer={footer}>
      <GoalSheetBody
        goalDraft={goalDraft}
        targetsDraft={targetsDraft}
        presence={presence}
        openingGoal={openingGoal}
        hasError={hasError}
        onSubmit={submit}
      />
    </Sheet>
  );
};
