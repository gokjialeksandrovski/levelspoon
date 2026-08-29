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
