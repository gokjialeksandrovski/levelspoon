import { describe, expect, it } from "vitest";

import {
  CALORIE_GOAL_STEP,
  calorieRemaining,
  clampCalorieGoal,
  commitGoalDraft,
  GOAL_STORAGE_CEILING,
  isUnusableGoalDraft,
  isValidCalorieGoal,
  nudgeCalorieGoal,
  MIN_CALORIE_GOAL,
} from "./goals.utils";

describe("calorieRemaining", () => {
  it("reports unset when no goal is set", () => {
    expect(calorieRemaining(null, 1200)).toEqual({ status: "unset", kcal: 0 });
  });

  it("reports left when under goal", () => {
    expect(calorieRemaining(2000, 1340)).toEqual({ status: "left", kcal: 660 });
  });

  it("reports left with zero kcal exactly at goal", () => {
    expect(calorieRemaining(2000, 2000)).toEqual({ status: "left", kcal: 0 });
  });

  it("reports over when past goal", () => {
    expect(calorieRemaining(2000, 2140)).toEqual({ status: "over", kcal: 140 });
  });

  it("rounds fractional kcal", () => {
    expect(calorieRemaining(2000, 1339.6)).toEqual({ status: "left", kcal: 660 });
  });

  it("agrees with the rounded consumed figure shown beside it", () => {
    // 502.5 displays as 503, so the gap must be 1497 - rounding the
    // subtraction instead of the input leaves the two numbers summing to 2001.
    const consumed = 502.5;
    expect(Math.round(consumed) + calorieRemaining(2000, consumed).kcal).toBe(2000);
  });
});

describe("isValidCalorieGoal", () => {
  it("accepts the boundary values", () => {
    expect(isValidCalorieGoal(MIN_CALORIE_GOAL)).toBe(true);
    expect(isValidCalorieGoal(GOAL_STORAGE_CEILING)).toBe(true);
  });

  it("rejects below minimum, above maximum, and non-integers", () => {
    expect(isValidCalorieGoal(MIN_CALORIE_GOAL - 1)).toBe(false);
    expect(isValidCalorieGoal(GOAL_STORAGE_CEILING + 1)).toBe(false);
    expect(isValidCalorieGoal(2000.5)).toBe(false);
  });
});

describe("clampCalorieGoal", () => {
  it("holds values inside the range unchanged", () => {
    expect(clampCalorieGoal(2350)).toBe(2350);
  });

  it("pulls values outside the range to the nearest bound", () => {
    expect(clampCalorieGoal(MIN_CALORIE_GOAL - 100)).toBe(MIN_CALORIE_GOAL);
    expect(clampCalorieGoal(GOAL_STORAGE_CEILING + 91000)).toBe(GOAL_STORAGE_CEILING);
  });
});

describe("commitGoalDraft", () => {
  it("takes a typed value inside the range", () => {
    expect(commitGoalDraft("2350", 2000)).toBe(2350);
  });

  it("keeps a target below what any guideline would advise", () => {
    expect(commitGoalDraft("900", 2000)).toBe(900);
    expect(commitGoalDraft("450", 2000)).toBe(450);
  });

  it("keeps a target above what any guideline would advise", () => {
    expect(commitGoalDraft("7500", 2000)).toBe(7500);
  });

  it("clamps only at what the column can store", () => {
    expect(commitGoalDraft(String(GOAL_STORAGE_CEILING + 1000), 2000)).toBe(GOAL_STORAGE_CEILING);
  });

  it("rounds a typed decimal", () => {
    expect(commitGoalDraft("2350.6", 2000)).toBe(2351);
  });

  it("keeps the current goal when the field is left empty", () => {
    expect(commitGoalDraft("", 2350)).toBe(2350);
    expect(commitGoalDraft("   ", 2350)).toBe(2350);
  });

  it("keeps the current goal when the text is not a number", () => {
    expect(commitGoalDraft("abc", 2350)).toBe(2350);
  });

  it("keeps the current goal for a negative typed value", () => {
    expect(commitGoalDraft("-2000", 2350)).toBe(2350);
  });
});

describe("isUnusableGoalDraft", () => {
  it("flags exactly the drafts commitGoalDraft falls back on", () => {
    expect(isUnusableGoalDraft("")).toBe(true);
    expect(isUnusableGoalDraft("   ")).toBe(true);
    expect(isUnusableGoalDraft("abc")).toBe(true);
    expect(isUnusableGoalDraft("-2000")).toBe(true);
    expect(isUnusableGoalDraft("0")).toBe(true);
  });

  it("passes a target the sheet should save", () => {
    expect(isUnusableGoalDraft("900")).toBe(false);
    expect(isUnusableGoalDraft("2350.6")).toBe(false);
  });
});

describe("nudgeCalorieGoal", () => {
  it("steps relative to the target on screen", () => {
    expect(nudgeCalorieGoal(1450, 500)).toBe(1950);
    expect(nudgeCalorieGoal(1450, -500)).toBe(950);
  });

  it("reaches a contest-prep target the old floor would have blocked", () => {
    expect(nudgeCalorieGoal(1400, -500)).toBe(900);
    expect(nudgeCalorieGoal(900, -500)).toBe(400);
  });

  it("reaches a bulk target the old ceiling would have blocked", () => {
    expect(nudgeCalorieGoal(4000, 500)).toBe(4500);
  });

  it("lands on one step instead of a leftover when it runs out of room", () => {
    expect(nudgeCalorieGoal(200, -500)).toBe(CALORIE_GOAL_STEP);
  });
});
