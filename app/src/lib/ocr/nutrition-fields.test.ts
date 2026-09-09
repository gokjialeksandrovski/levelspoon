import { describe, expect, it } from "vitest";

import { flaggedFieldSet, toFieldValues, toNutritionValues } from "./nutrition-fields";

describe("toFieldValues", () => {
  it("stringifies numbers and renders null as an empty string", () => {
    const result = toFieldValues({
      energyKcal: 70, fatG: null, saturatesG: 1.2, carbohydrateG: 4, sugarsG: 4, proteinG: 9, saltG: 0.18,
    });
    expect(result.energyKcal).toBe("70");
    expect(result.fatG).toBe("");
  });

  it("preserves a label's own 2-decimal salt figure instead of collapsing it to 1", () => {
    // A real EU label reads Salt 0.18g directly, with no scaling involved -
    // the display must reproduce it, not round away a digit the label
    // author printed on purpose.
    const result = toFieldValues({
      energyKcal: 70, fatG: 2.0, saturatesG: 1.2, carbohydrateG: 4.0, sugarsG: 4.0, proteinG: 9.0, saltG: 0.18,
    });
    expect(result.saltG).toBe("0.18");
  });

  it("rounds a scaled per-serving figure to label precision", () => {
    // 200 kcal / 12g fat / 23g carbohydrate on a 37g US serving, scaled to
    // per-100g - the long floats that reach the confirm step unrounded.
    const result = toFieldValues({
      energyKcal: 540.5405405405405,
      fatG: 32.432432432432435,
      saturatesG: 10.81081081081081,
      carbohydrateG: 62.16216216216216,
      sugarsG: 56.75675675675676,
      proteinG: 5.405405405405405,
      saltG: 0.10135135135135134,
    });
    expect(result.energyKcal).toBe("540.54");
    expect(result.fatG).toBe("32.43");
    expect(result.saltG).toBe("0.1");
  });
});

describe("toNutritionValues", () => {
  it("parses string field values back into numbers", () => {
    const result = toNutritionValues({
      energyKcal: "70", fatG: "2.0", saturatesG: "1.2", carbohydrateG: "4.0", sugarsG: "4.0", proteinG: "9.0", saltG: "0.18",
    });
    expect(result.energyKcal).toBe(70);
    expect(result.fatG).toBe(2.0);
  });
});

describe("flaggedFieldSet", () => {
  it("maps ocr-service's snake_case flags to camelCase field names", () => {
    const result = flaggedFieldSet(["saturates_g", "fat_g"]);
    expect(result).toEqual(new Set(["saturatesG", "fatG"]));
  });

  it("ignores an unrecognized flag rather than throwing", () => {
    const result = flaggedFieldSet(["not_a_real_field"]);
    expect(result.size).toBe(0);
  });
});
