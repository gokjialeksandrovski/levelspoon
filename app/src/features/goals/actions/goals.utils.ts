// Lives here, not in goals.ts: goals.ts is "use server", which may only
// export async functions.

// No dietary floor or ceiling by design: a contest prep or mini-cut runs well
// under 1200 and a bulk well over 4000, and which one a person is doing is not
// this app's call to make. What is left guards storage and typing, not intake -
// daily_calorie_goal is a Postgres integer, and zero or negative kcal is a
// slipped keystroke rather than a target anyone means.
export const MIN_CALORIE_GOAL = 1;
export const GOAL_STORAGE_CEILING = 2_147_483_647;
export const CALORIE_GOAL_STEP = 50;
export const DEFAULT_CALORIE_GOAL = 2000;

export const isValidCalorieGoal = (goal: number): boolean =>
  Number.isInteger(goal) && goal >= MIN_CALORIE_GOAL && goal <= GOAL_STORAGE_CEILING;

export const clampCalorieGoal = (goal: number): number =>
  Math.min(GOAL_STORAGE_CEILING, Math.max(MIN_CALORIE_GOAL, goal));

// The exact condition commitGoalDraft falls back on, exported so the sheet can
// say a draft was dropped instead of letting the typed text vanish in silence.
// An empty field counts: Number("") is 0, and a cleared field is the commonest
// way to reach the fallback.
export const isUnusableGoalDraft = (draft: string): boolean => {
  const typed = Number(draft.trim());
  return !Number.isFinite(typed) || typed <= 0;
};

// Runs on blur, not on every keystroke: clamping mid-typing rewrites "2" into
// the nearest allowed value and the next digit lands after it, so the target is
// never typeable. Nonsense text keeps the last good goal rather than snapping
// to a bound - "abc" and "-2000" are both a slip, not an amount the user meant.
export const commitGoalDraft = (draft: string, currentGoal: number): number => {
  if (isUnusableGoalDraft(draft)) {
    return currentGoal;
  }
  return clampCalorieGoal(Math.round(Number(draft.trim())));
};

// A nudge is relative to whatever target is on screen, and lands on one step
// rather than on 1 kcal when it runs out of room downwards: subtraction's
// leftovers are not a target anyone typed.
export const nudgeCalorieGoal = (goal: number, delta: number): number =>
  Math.max(CALORIE_GOAL_STEP, clampCalorieGoal(goal + delta));

export type CalorieRemainingStatus = "unset" | "left" | "over";

export interface CalorieRemaining {
  status: CalorieRemainingStatus;
  kcal: number;
}

// Single source of truth for "left" vs "over" - shared by the day hero and
// the meal-detail bracket so both surfaces read the same number the same way.
export const calorieRemaining = (goal: number | null, consumedKcal: number): CalorieRemaining => {
  if (goal === null) {
    return { status: "unset", kcal: 0 };
  }
  // Rounds what was consumed before subtracting, not the difference: every
  // surface shows the rounded total next to this figure, and rounding them
  // apart lets the pair miss the goal by one.
  const remaining = goal - Math.round(consumedKcal);
  return remaining >= 0 ? { status: "left", kcal: remaining } : { status: "over", kcal: -remaining };
};
