import { GOAL_STORAGE_CEILING } from "./goals.utils";

// Names the storage limit it actually is: the app sets no dietary bound, so
// the only rejected goals are a non-number, zero or below, or past what the
// column can hold.
export class InvalidCalorieGoalError extends Error {
  constructor(goal: number) {
    super(`Calorie goal must be a whole number above 0 and at most ${GOAL_STORAGE_CEILING}, got ${goal}`);
    this.name = "InvalidCalorieGoalError";
  }
}
