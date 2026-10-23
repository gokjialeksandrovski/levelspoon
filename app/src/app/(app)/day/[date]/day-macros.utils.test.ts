import { describe, expect, it } from "vitest";

import { macroGramShares, targetShare } from "./day-macros.utils";

describe("macroGramShares", () => {
  it("computes shares by gram weight, matching the numbers printed on screen", () => {
    // 120g carbs vs 45g fat vs 34g protein - shares must reflect grams
    // directly, the same unit the P/C/F figures themselves display.
    const shares = macroGramShares({ proteinG: 34, carbohydrateG: 120, fatG: 45 });

    expect(shares.protein).toBeCloseTo(34 / 199, 5);
    expect(shares.carbs).toBeCloseTo(120 / 199, 5);
    expect(shares.fat).toBeCloseTo(45 / 199, 5);
  });

  it("gives the calorically denser macro a smaller share when it has fewer grams", () => {
    // Fat is calorically denser than protein or carbs, but the bar must not
    // let that inflate its share past what its own gram count earns it.
    const shares = macroGramShares({ proteinG: 14, carbohydrateG: 19, fatG: 11 });
    expect(shares.fat).toBeLessThan(shares.protein);
    expect(shares.fat).toBeLessThan(shares.carbs);
  });

  it("sums to exactly 1 so the segmented rule has no gap", () => {
    const shares = macroGramShares({ proteinG: 34, carbohydrateG: 120, fatG: 45 });
    expect(shares.protein + shares.carbs + shares.fat).toBeCloseTo(1, 10);
  });

  it("returns all zero when every macro is zero, instead of dividing by zero", () => {
    const shares = macroGramShares({ proteinG: 0, carbohydrateG: 0, fatG: 0 });
    expect(shares).toEqual({ protein: 0, carbs: 0, fat: 0 });
  });

  it("handles a single-macro day without NaN", () => {
    const shares = macroGramShares({ proteinG: 0, carbohydrateG: 50, fatG: 0 });
    expect(shares).toEqual({ protein: 0, carbs: 1, fat: 0 });
  });
});

describe("targetShare", () => {
  it("fills in proportion below target", () => {
    expect(targetShare(79, 158)).toBe(0.5);
  });

  it("clamps at a full rail past target", () => {
    expect(targetShare(240, 210)).toBe(1);
  });

  it("treats a 0g target as empty until something is eaten", () => {
    expect(targetShare(0, 0)).toBe(0);
    expect(targetShare(3, 0)).toBe(1);
  });
});
