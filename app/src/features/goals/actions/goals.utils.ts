// Lives here, not in goals.ts: goals.ts is "use server", which may only
// export async functions.
export const MIN_CALORIE_GOAL = 1200;
export const MAX_CALORIE_GOAL = 4000;
export const CALORIE_GOAL_STEP = 50;
export const DEFAULT_CALORIE_GOAL = 2000;

export const isValidCalorieGoal = (goal: number): boolean =>
  Number.isInteger(goal) && goal >= MIN_CALORIE_GOAL && goal <= MAX_CALORIE_GOAL;

export const clampCalorieGoal = (goal: number): number =>
  Math.min(MAX_CALORIE_GOAL, Math.max(MIN_CALORIE_GOAL, goal));

// Runs on blur, not on every keystroke: clamping mid-typing rewrites "2" into
// 1200 and the next digit lands after it, so the target is never typeable.
// Nonsense text keeps the last good goal rather than snapping to a bound -
// "abc" and "-2000" are both a slip, not an amount the user meant.
export const commitGoalDraft = (draft: string, currentGoal: number): number => {
  const typed = Number(draft.trim());
  if (draft.trim() === "" || !Number.isFinite(typed) || typed <= 0) {
    return currentGoal;
  }
  return clampCalorieGoal(Math.round(typed));
};

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
