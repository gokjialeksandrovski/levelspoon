import { describe, expect, it } from "vitest";

import { macroCalorieShares } from "./day-macros.utils";

describe("macroCalorieShares", () => {
  it("computes shares by calorie contribution, not by gram weight", () => {
    // 120g carbs (480 kcal) vs 45g fat (405 kcal) is a 2.7x gap by weight
    // but only 1.2x by calories - shares must reflect calories (spec §4.2).
    const shares = macroCalorieShares({ proteinG: 34, carbohydrateG: 120, fatG: 45 });

    // protein: 34*4=136, carbs: 120*4=480, fat: 45*9=405, total=1021
    expect(shares.protein).toBeCloseTo(136 / 1021, 5);
    expect(shares.carbs).toBeCloseTo(480 / 1021, 5);
    expect(shares.fat).toBeCloseTo(405 / 1021, 5);
  });

  it("sums to exactly 1 so the segmented rule has no gap", () => {
    const shares = macroCalorieShares({ proteinG: 34, carbohydrateG: 120, fatG: 45 });
    expect(shares.protein + shares.carbs + shares.fat).toBeCloseTo(1, 10);
  });

  it("returns all zero when every macro is zero, instead of dividing by zero", () => {
    const shares = macroCalorieShares({ proteinG: 0, carbohydrateG: 0, fatG: 0 });
    expect(shares).toEqual({ protein: 0, carbs: 0, fat: 0 });
  });

  it("handles a single-macro day without NaN", () => {
    const shares = macroCalorieShares({ proteinG: 0, carbohydrateG: 50, fatG: 0 });
    expect(shares).toEqual({ protein: 0, carbs: 1, fat: 0 });
  });
});
