"use client";

import { useState } from "react";

import { setCalorieGoal } from "@/features/goals/actions/goals";
import { CALORIE_GOAL_STEP, DEFAULT_CALORIE_GOAL, MAX_CALORIE_GOAL, MIN_CALORIE_GOAL } from "@/features/goals/actions/goals.utils";
import { Button, buttonClassName } from "@/components/ui/button";
import { InlineMessage } from "@/components/ui/inline-message";
import { Sheet } from "@/components/ui/sheet";

const clampGoal = (goal: number): number => Math.min(MAX_CALORIE_GOAL, Math.max(MIN_CALORIE_GOAL, goal));

const GOAL_CHIP_DECREASE = -100;
const GOAL_CHIP_INCREASE = 100;
const GOAL_CHIPS = [GOAL_CHIP_DECREASE, GOAL_CHIP_INCREASE] as const;

interface GoalNumberInputProps {
  goal: number;
  onChange: (goal: number) => void;
}

// Large centered figure, not a boxed Field: this is the sheet's one value to
// pick, not a form to fill in - the slider below is the same value's other hand.
const GoalNumberInput = ({ goal, onChange }: GoalNumberInputProps) => (
  <input
    type="number"
    inputMode="numeric"
    min={MIN_CALORIE_GOAL}
    max={MAX_CALORIE_GOAL}
    step={CALORIE_GOAL_STEP}
    value={goal}
    aria-label="Daily calorie goal"
    onChange={(event) => onChange(clampGoal(Number(event.target.value) || MIN_CALORIE_GOAL))}
    className="w-full rounded-control bg-transparent text-center font-display text-4xl font-semibold tabular-nums text-text focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-text"
  />
);

interface GoalSliderProps {
  goal: number;
  onChange: (goal: number) => void;
}

// Native range, custom-styled: no slider wrapper exists yet in this app's
// component set for this shape.
const GoalSlider = ({ goal, onChange }: GoalSliderProps) => (
  <input
    type="range"
    min={MIN_CALORIE_GOAL}
    max={MAX_CALORIE_GOAL}
    step={CALORIE_GOAL_STEP}
    value={goal}
    aria-label="Adjust daily calorie goal"
    onChange={(event) => onChange(Number(event.target.value))}
    className="h-2 w-full cursor-pointer appearance-none rounded-full bg-border accent-text"
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
      <button
        key={delta}
        type="button"
        onClick={() => onChange(clampGoal(goal + delta))}
        className={buttonClassName("ghost", "flex-1")}
      >
        {delta > 0 ? `+${delta}` : delta}
      </button>
    ))}
    <button type="button" onClick={() => onChange(DEFAULT_CALORIE_GOAL)} className={buttonClassName("ghost", "flex-1")}>
      {DEFAULT_CALORIE_GOAL}
    </button>
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

interface GoalSheetBodyProps {
  tempGoal: number;
  onChange: (goal: number) => void;
  hasError: boolean;
}

const GoalSheetBody = ({ tempGoal, onChange, hasError }: GoalSheetBodyProps) => (
  <div className="flex flex-col gap-4">
    <GoalNumberInput goal={tempGoal} onChange={onChange} />
    <GoalSlider goal={tempGoal} onChange={onChange} />
    <GoalChips goal={tempGoal} onChange={onChange} />
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
  const [tempGoal, setTempGoal] = useState(initialGoal ?? DEFAULT_CALORIE_GOAL);
  const { isSaving, hasError, save } = useSaveCalorieGoal(onSaved, onClose);

  const footer = (
    <Button variant="primary" className="w-full" pending={isSaving} onClick={() => save(tempGoal)}>
      Save target
    </Button>
  );

  return (
    <Sheet open={open} onClose={onClose} title="Daily calorie goal" footer={footer}>
      <GoalSheetBody tempGoal={tempGoal} onChange={setTempGoal} hasError={hasError} />
    </Sheet>
  );
};
