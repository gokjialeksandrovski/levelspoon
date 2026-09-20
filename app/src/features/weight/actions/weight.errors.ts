// app/src/features/weight/actions/weight.errors.ts
import { MAX_WEIGHT_KG, MIN_WEIGHT_KG, type InvalidGoalReason } from "./weight.utils";

// Named because the action tests discriminate them with .rejects.toThrow, and
// because the bound each names is a storage-and-typing guard, not a dietary
// opinion - a reading outside it is a slipped keystroke.
export class InvalidWeightError extends Error {
  constructor(weightKg: number) {
    super(`Weight must be between ${MIN_WEIGHT_KG} and ${MAX_WEIGHT_KG} kg, got ${weightKg}`);
    this.name = "InvalidWeightError";
  }
}

export class InvalidWeightGoalError extends Error {
  constructor(reason: InvalidGoalReason) {
    super(`Weight goal rejected: ${reason}`);
    this.name = "InvalidWeightGoalError";
  }
}
