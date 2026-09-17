// Lives here, not in goals.ts: goals.ts is "use server", which may only
// export async functions.
export const MIN_CALORIE_GOAL = 1200;
export const MAX_CALORIE_GOAL = 4000;
export const CALORIE_GOAL_STEP = 50;
export const DEFAULT_CALORIE_GOAL = 2000;

export const isValidCalorieGoal = (goal: number): boolean =>
  Number.isInteger(goal) && goal >= MIN_CALORIE_GOAL && goal <= MAX_CALORIE_GOAL;

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
  const remaining = Math.round(goal - consumedKcal);
  return remaining >= 0 ? { status: "left", kcal: remaining } : { status: "over", kcal: -remaining };
};
