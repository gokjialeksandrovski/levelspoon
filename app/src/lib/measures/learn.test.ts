import { describe, expect, it } from "vitest";

import { hasLearned, learnFromServing, NOTHING_LEARNED } from "./learn";

describe("learnFromServing", () => {
  it("derives a density when the line prints a volume alongside a gram weight", () => {
    // 37 g over 2 x 15 mL = 1.2333 g/mL - the label states its own density.
    const learned = learnFromServing("2 Tbsp (37g)", 37);
    expect(learned.densityGMl).toBeCloseTo(1.2333, 4);
    expect(learned.servingUnit).toBeNull();
    expect(learned.servingGrams).toBeNull();
  });

  it("derives a density from a cup measure", () => {
    const learned = learnFromServing("1 cup", 120);
    expect(learned.densityGMl).toBeCloseTo(0.5, 4);
  });

  it("stores a per-unit weight for a count unit", () => {
    const learned = learnFromServing("1 bas", 52);
    expect(learned).toEqual({ densityGMl: null, servingUnit: "bas", servingGrams: 52 });
  });

  it("divides by the quantity so a multi-item serving stores the per-item weight", () => {
    const learned = learnFromServing("4 gummies", 12);
    expect(learned).toEqual({ densityGMl: null, servingUnit: "gummies", servingGrams: 3 });
  });

  it("learns nothing from a line that already states a mass", () => {
    expect(learnFromServing("52 g", 52)).toEqual(NOTHING_LEARNED);
  });

  it("learns nothing from a line with no measure at all", () => {
    expect(learnFromServing("Serving size", 52)).toEqual(NOTHING_LEARNED);
  });

  it("learns nothing from a non-positive gram weight", () => {
    expect(learnFromServing("2 tbsp", 0)).toEqual(NOTHING_LEARNED);
  });
});

describe("hasLearned", () => {
  it("is false for the all-null value", () => {
    expect(hasLearned(NOTHING_LEARNED)).toBe(false);
  });

  it("is true once a density is known", () => {
    expect(hasLearned({ densityGMl: 1.23, servingUnit: null, servingGrams: null })).toBe(true);
  });

  it("is true once a serving weight is known", () => {
    expect(hasLearned({ densityGMl: null, servingUnit: "bar", servingGrams: 52 })).toBe(true);
  });
});
