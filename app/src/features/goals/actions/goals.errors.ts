import { MAX_CALORIE_GOAL, MIN_CALORIE_GOAL } from "./goals.utils";

export class InvalidCalorieGoalError extends Error {
  constructor(goal: number) {
    super(`Calorie goal must be a whole number between ${MIN_CALORIE_GOAL} and ${MAX_CALORIE_GOAL}, got ${goal}`);
    this.name = "InvalidCalorieGoalError";
  }
}
