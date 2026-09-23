import { describe, expect, it } from "vitest";

import type { NutritionValues } from "@/types/nutrition";

import { scaleNutrition, scalePerServingToPer100g } from "./scale-per-serving";

const PER_SERVING: NutritionValues = {
  energyKcal: 190,
  fatG: 16,
  saturatesG: 3,
  carbohydrateG: 7,
  sugarsG: 3,
  proteinG: 8,
  saltG: 0.45,
  fibreG: null,
};

describe("scalePerServingToPer100g", () => {
  it("scales every field by 100/grams", () => {
    const result = scalePerServingToPer100g(PER_SERVING, 30);

    expect(result.energyKcal).toBeCloseTo((190 / 30) * 100);
    expect(result.fatG).toBeCloseTo((16 / 30) * 100);
    expect(result.saltG).toBeCloseTo((0.45 / 30) * 100);
  });

  it("leaves values unchanged when grams is already 100", () => {
    const values: NutritionValues = {
      energyKcal: 70,
      fatG: 2,
      saturatesG: 1.2,
      carbohydrateG: 4,
      sugarsG: 4,
      proteinG: 9,
      saltG: 0.18,
      fibreG: 0.5,
    };
    expect(scalePerServingToPer100g(values, 100)).toEqual(values);
  });
});

describe("scaleNutrition", () => {
  it("scales a known fibre figure with everything else", () => {
    const scaled = scaleNutrition({ ...PER_SERVING, fibreG: 3 }, 2);
    expect(scaled.fibreG).toBe(6);
  });

  it("leaves an unknown fibre unknown rather than scaling it to zero", () => {
    const scaled = scaleNutrition({ ...PER_SERVING, fibreG: null }, 2);
    expect(scaled.fibreG).toBeNull();
  });
});
