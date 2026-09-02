import { describe, expect, it } from "vitest";

import { scalePerServingToPer100g } from "./scale-per-serving";

describe("scalePerServingToPer100g", () => {
  it("scales every field by 100/grams", () => {
    const result = scalePerServingToPer100g(
      { energyKcal: 190, fatG: 16, saturatesG: 3, carbohydrateG: 7, sugarsG: 3, proteinG: 8, saltG: 0.45 },
      30,
    );

    expect(result.energyKcal).toBeCloseTo((190 / 30) * 100);
    expect(result.fatG).toBeCloseTo((16 / 30) * 100);
    expect(result.saltG).toBeCloseTo((0.45 / 30) * 100);
  });

  it("leaves values unchanged when grams is already 100", () => {
    const values = { energyKcal: 70, fatG: 2, saturatesG: 1.2, carbohydrateG: 4, sugarsG: 4, proteinG: 9, saltG: 0.18 };
    expect(scalePerServingToPer100g(values, 100)).toEqual(values);
  });
});
