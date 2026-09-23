import { GOAL_STORAGE_CEILING } from "./goals.utils";
import type { MacroTargets } from "./macro-targets.utils";

// Names the storage limit it actually is: the app sets no dietary bound, so
// the only rejected goals are a non-number, zero or below, or past what the
// column can hold.
export class InvalidCalorieGoalError extends Error {
  constructor(goal: number) {
    super(`Calorie goal must be a whole number above 0 and at most ${GOAL_STORAGE_CEILING}, got ${goal}`);
    this.name = "InvalidCalorieGoalError";
  }
}

// Backstop only: the sheet reads the draft first and never sends a split that
// overfills the day or a share without a kcal goal to take it from.
export class InvalidMacroTargetsError extends Error {
  constructor(targets: MacroTargets, reason: string) {
    super(`Macro targets ${JSON.stringify(targets)} refused: ${reason}`);
    this.name = "InvalidMacroTargetsError";
  }
}

export class MacroTargetsNeedGoalError extends Error {
  constructor() {
    super("Macro targets set as a share of kcal need a daily calorie goal to turn into grams");
    this.name = "MacroTargetsNeedGoalError";
  }
}
