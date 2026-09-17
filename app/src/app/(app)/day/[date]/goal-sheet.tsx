"use client";

import { useState } from "react";

import { setCalorieGoal } from "@/features/goals/actions/goals";
import {
  CALORIE_GOAL_STEP,
  clampCalorieGoal,
  commitGoalDraft,
  DEFAULT_CALORIE_GOAL,
  isValidCalorieGoal,
  MAX_CALORIE_GOAL,
  MIN_CALORIE_GOAL,
} from "@/features/goals/actions/goals.utils";
import { Button } from "@/components/ui/button";
import { InlineMessage } from "@/components/ui/inline-message";
import { Sheet } from "@/components/ui/sheet";

const GOAL_CHIP_DECREASE = -100;
const GOAL_CHIP_INCREASE = 100;
const GOAL_CHIPS = [GOAL_CHIP_DECREASE, GOAL_CHIP_INCREASE] as const;

interface GoalNumberInputProps {
  draft: string;
  onType: (draft: string) => void;
  onCommit: () => void;
}

// Large centered figure, not a boxed Field: this is the sheet's one value to
// pick, not a form to fill in - the slider below is the same value's other hand.
const GoalNumberInput = ({ draft, onType, onCommit }: GoalNumberInputProps) => (
  <input
    type="number"
    inputMode="numeric"
    min={MIN_CALORIE_GOAL}
    max={MAX_CALORIE_GOAL}
    step={CALORIE_GOAL_STEP}
    value={draft}
    aria-label="Daily calorie goal"
    onChange={(event) => onType(event.target.value)}
    onBlur={onCommit}
    className="w-full rounded-control bg-transparent text-center font-display text-4xl font-semibold tabular-nums text-text focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-text"
  />
);

interface GoalSliderProps {
  goal: number;
  onChange: (goal: number) => void;
}

// Native range, custom-styled: no slider wrapper exists yet in this app's
// component set for this shape. The thumb itself is drawn in globals.css -
// appearance-none deletes the native one and no Tailwind utility reaches
// ::-webkit-slider-thumb.
const GoalSlider = ({ goal, onChange }: GoalSliderProps) => (
  <input
    type="range"
    min={MIN_CALORIE_GOAL}
    max={MAX_CALORIE_GOAL}
    step={CALORIE_GOAL_STEP}
    value={goal}
    aria-label="Adjust daily calorie goal"
    onChange={(event) => onChange(Number(event.target.value))}
    className="h-2 w-full cursor-pointer appearance-none rounded-full bg-border focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-text"
  />
);

interface GoalChipsProps {
  goal: number;
  onChange: (goal: number) => void;
}

// -100/+100 nudge relative to the current value; the flat 2000 chip is a
// reset to the general-population reference intake, not a relative step.
const GoalChips = ({ goal, onChange }: GoalChipsProps) => (
  <div className="flex gap-2">
    {GOAL_CHIPS.map((delta) => (
      <Button key={delta} variant="ghost" className="flex-1" onClick={() => onChange(clampCalorieGoal(goal + delta))}>
        {delta > 0 ? `+${delta}` : delta}
      </Button>
    ))}
    <Button variant="ghost" className="flex-1" onClick={() => onChange(DEFAULT_CALORIE_GOAL)}>
      {DEFAULT_CALORIE_GOAL}
    </Button>
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
  setGoal: (goal: number) => void;
  type: (draft: string) => void;
  commit: () => number;
}

// Text field and slider are two hands on one value, so the typed text keeps its
// own state: the slider follows as soon as a typed value is whole and in range,
// and anything half-typed stays on screen until blur resolves it.
const useGoalDraft = (initialGoal: number): GoalDraft => {
  const [goal, setGoalValue] = useState(initialGoal);
  const [draft, setDraft] = useState(String(initialGoal));

  const setGoal = (next: number) => {
    setGoalValue(next);
    setDraft(String(next));
  };

  const type = (next: string) => {
    setDraft(next);
    const typed = Number(next);
    if (isValidCalorieGoal(typed)) {
      setGoalValue(typed);
    }
  };

  const commit = (): number => {
    const next = commitGoalDraft(draft, goal);
    setGoal(next);
    return next;
  };

  return { goal, draft, setGoal, type, commit };
};

interface GoalSheetBodyProps {
  goalDraft: GoalDraft;
  hasError: boolean;
}

const GoalSheetBody = ({ goalDraft, hasError }: GoalSheetBodyProps) => (
  <div className="flex flex-col gap-4">
    <GoalNumberInput draft={goalDraft.draft} onType={goalDraft.type} onCommit={goalDraft.commit} />
    <GoalSlider goal={goalDraft.goal} onChange={goalDraft.setGoal} />
    <GoalChips goal={goalDraft.goal} onChange={goalDraft.setGoal} />
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
  const goalDraft = useGoalDraft(initialGoal ?? DEFAULT_CALORIE_GOAL);
  const { isSaving, hasError, save } = useSaveCalorieGoal(onSaved, onClose);

  // Commits the draft rather than reading state: a tap on Save blurs the field
  // first, but the resulting state update is not visible to this handler yet.
  const footer = (
    <Button variant="primary" className="w-full" pending={isSaving} onClick={() => save(goalDraft.commit())}>
      Save target
    </Button>
  );

  return (
    <Sheet open={open} onClose={onClose} title="Daily calorie goal" footer={footer}>
      <GoalSheetBody goalDraft={goalDraft} hasError={hasError} />
    </Sheet>
  );
};
