import { describe, expect, it } from "vitest";

import {
  calorieRemaining,
  clampCalorieGoal,
  commitGoalDraft,
  isValidCalorieGoal,
  MAX_CALORIE_GOAL,
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
    expect(isValidCalorieGoal(MAX_CALORIE_GOAL)).toBe(true);
  });

  it("rejects below minimum, above maximum, and non-integers", () => {
    expect(isValidCalorieGoal(MIN_CALORIE_GOAL - 1)).toBe(false);
    expect(isValidCalorieGoal(MAX_CALORIE_GOAL + 1)).toBe(false);
    expect(isValidCalorieGoal(2000.5)).toBe(false);
  });
});

describe("clampCalorieGoal", () => {
  it("holds values inside the range unchanged", () => {
    expect(clampCalorieGoal(2350)).toBe(2350);
  });

  it("pulls values outside the range to the nearest bound", () => {
    expect(clampCalorieGoal(400)).toBe(MIN_CALORIE_GOAL);
    expect(clampCalorieGoal(99000)).toBe(MAX_CALORIE_GOAL);
  });
});

describe("commitGoalDraft", () => {
  it("takes a typed value inside the range", () => {
    expect(commitGoalDraft("2350", 2000)).toBe(2350);
  });

  it("clamps a typed value outside the range instead of rejecting it", () => {
    expect(commitGoalDraft("900", 2000)).toBe(MIN_CALORIE_GOAL);
    expect(commitGoalDraft("9000", 2000)).toBe(MAX_CALORIE_GOAL);
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
