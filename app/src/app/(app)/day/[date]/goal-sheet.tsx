"use client";

import Link from "next/link";
import { useId, useState } from "react";

import { setCalorieGoal } from "@/features/goals/actions/goals";
import {
  commitGoalDraft,
  DEFAULT_CALORIE_GOAL,
  isUnusableGoalDraft,
  isValidCalorieGoal,
  nudgeCalorieGoal,
} from "@/features/goals/actions/goals.utils";
import { Button, buttonClassName } from "@/components/ui/button";
import { InlineMessage } from "@/components/ui/inline-message";
import { Sheet } from "@/components/ui/sheet";

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

interface SaveCalorieGoal {
  isSaving: boolean;
  hasError: boolean;
  save: (goal: number) => void;
}

// Isolates the pending/error dance so GoalSheet itself stays a plain layout.
const useSaveCalorieGoal = (onSaved: (goal: number) => void, onClose: () => void): SaveCalorieGoal => {
  const [isSaving, setIsSaving] = useState(false);
  const [hasError, setHasError] = useState(false);

  const save = (goal: number): void => {
    setIsSaving(true);
    setHasError(false);
    setCalorieGoal(goal)
      .then(() => {
        onSaved(goal);
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

interface GoalSheetBodyProps {
  goalDraft: GoalDraft;
  openingGoal: number;
  hasError: boolean;
  onSubmit: () => void;
}

// gap-3 inside the group, gap-6 out to the messages: the chips are a control
// for the number directly above them, and one flat gap spaced them as far from
// it as from the save action.
const GoalSheetBody = ({ goalDraft, openingGoal, hasError, onSubmit }: GoalSheetBodyProps) => (
  <div className="flex flex-col gap-6">
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
    </div>
    {/* The one way into the estimate (spec §2): the moment a user is holding
        a number they cannot fill. */}
    <Link href="/calories/estimate" className={buttonClassName("ghost", "self-center", true)}>
      Not sure? Work it out
    </Link>
    {goalDraft.wasRejected && (
      <InlineMessage tone="info">That was not a number we could read, so the goal above is unchanged.</InlineMessage>
    )}
    {hasError && <InlineMessage tone="error">Could not save. Please try again.</InlineMessage>}
  </div>
);

interface GoalSheetProps {
  open: boolean;
  initialGoal: number | null;
  onClose: () => void;
  onSaved: (goal: number) => void;
}

// No effect resyncing tempGoal on reopen: CalorieHero remounts this whole
// component (a fresh `key` per open) instead, so state just starts clean.
export const GoalSheet = ({ open, initialGoal, onClose, onSaved }: GoalSheetProps) => {
  const openingGoal = initialGoal ?? DEFAULT_CALORIE_GOAL;
  const goalDraft = useGoalDraft(openingGoal);
  const { isSaving, hasError, save } = useSaveCalorieGoal(onSaved, onClose);

  // Commits the draft rather than reading state: a tap on Save blurs the field
  // first, but the resulting state update is not visible to this handler yet -
  // which is also why the unusable-draft check reads the pre-blur text. Saving
  // is skipped in that case so the sheet stays open to say so, rather than
  // closing on a value the user did not type.
  const submit = () => {
    const next = goalDraft.commit();
    if (isUnusableGoalDraft(goalDraft.draft)) return;
    save(next);
  };

  const footer = (
    <Button variant="primary" className="w-full" pending={isSaving} onClick={submit}>
      Save goal
    </Button>
  );

  return (
    <Sheet open={open} onClose={onClose} title="Daily calorie goal" footer={footer}>
      <GoalSheetBody goalDraft={goalDraft} openingGoal={openingGoal} hasError={hasError} onSubmit={submit} />
    </Sheet>
  );
};
