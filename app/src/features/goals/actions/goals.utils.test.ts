import { describe, expect, it } from "vitest";

import { calorieRemaining, isValidCalorieGoal, MAX_CALORIE_GOAL, MIN_CALORIE_GOAL } from "./goals.utils";

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
