import { describe, expect, it } from "vitest";

import { ZERO_NUTRITION, addNutrition, productRowToNutritionValues } from "./totals";

const withFibre = (fibreG: number | null) => ({ ...ZERO_NUTRITION, energyKcal: 10, fibreG });

describe("addNutrition", () => {
  it("adds every figure", () => {
    const sum = addNutrition({ ...ZERO_NUTRITION, energyKcal: 70, proteinG: 9 }, { ...ZERO_NUTRITION, energyKcal: 30, proteinG: 1 });
    expect(sum.energyKcal).toBe(100);
    expect(sum.proteinG).toBe(10);
  });

  it("keeps fibre unknown only when both sides are unknown", () => {
    expect(addNutrition(withFibre(null), withFibre(null)).fibreG).toBeNull();
    expect(addNutrition(withFibre(null), withFibre(2)).fibreG).toBe(2);
    expect(addNutrition(withFibre(3), withFibre(2)).fibreG).toBe(5);
  });
});

describe("productRowToNutritionValues", () => {
  it("reads a null fibre column as unknown, never as zero", () => {
    const values = productRowToNutritionValues({
      energyKcal: "70", fatG: "2.0", saturatesG: "1.2", carbohydrateG: "4.0",
      sugarsG: "4.0", proteinG: "9.0", saltG: "0.18", fibreG: null,
    });
    expect(values.energyKcal).toBe(70);
    expect(values.fibreG).toBeNull();
  });
});
