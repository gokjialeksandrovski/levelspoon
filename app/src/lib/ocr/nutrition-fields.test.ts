import { describe, expect, it } from "vitest";

import { changedNutritionFields, FIELD_LABELS, flaggedFieldSet, NUTRITION_FIELD_GROUPS, toFieldValues, toNutritionValues } from "./nutrition-fields";
import type { FieldValues } from "./nutrition-fields";

describe("toFieldValues", () => {
  it("stringifies numbers and renders null as an empty string", () => {
    const result = toFieldValues({
      energyKcal: 70, fatG: null, saturatesG: 1.2, carbohydrateG: 4, sugarsG: 4, proteinG: 9, saltG: 0.18, fibreG: null,
    });
    expect(result.energyKcal).toBe("70");
    expect(result.fatG).toBe("");
  });

  it("preserves a label's own 2-decimal salt figure instead of collapsing it to 1", () => {
    // A real EU label reads Salt 0.18g directly, with no scaling involved -
    // the display must reproduce it, not round away a digit the label
    // author printed on purpose.
    const result = toFieldValues({
      energyKcal: 70, fatG: 2.0, saturatesG: 1.2, carbohydrateG: 4.0, sugarsG: 4.0, proteinG: 9.0, saltG: 0.18, fibreG: null,
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
      saltG: 0.10135135135135134, fibreG: null,
    });
    expect(result.energyKcal).toBe("540.54");
    expect(result.fatG).toBe("32.43");
    expect(result.saltG).toBe("0.1");
  });
});

describe("toNutritionValues", () => {
  it("parses string field values back into numbers", () => {
    const result = toNutritionValues({
      energyKcal: "70", fatG: "2.0", saturatesG: "1.2", carbohydrateG: "4.0", sugarsG: "4.0", proteinG: "9.0", saltG: "0.18", fibreG: "",
    });
    expect(result.energyKcal).toBe(70);
    expect(result.fatG).toBe(2.0);
  });
});

describe("NUTRITION_FIELD_GROUPS", () => {
  it("covers every field exactly once, so no field can be dropped from a form", () => {
    const grouped = NUTRITION_FIELD_GROUPS.flat();
    expect([...grouped].sort()).toEqual(Object.keys(FIELD_LABELS).sort());
  });

  it("keeps each EU label sub-figure with the total it belongs to", () => {
    expect(NUTRITION_FIELD_GROUPS).toEqual([
      ["energyKcal"],
      ["fatG", "saturatesG"],
      ["carbohydrateG", "sugarsG"],
      ["fibreG"],
      ["proteinG", "saltG"],
    ]);
  });
});

const LABEL_VALUES: FieldValues = {
  energyKcal: "70", fatG: "2", saturatesG: "1.2", carbohydrateG: "4", sugarsG: "4", proteinG: "9", saltG: "0.18", fibreG: "",
};

describe("changedNutritionFields", () => {
  it("reports nothing when every value is untouched", () => {
    expect(changedNutritionFields(LABEL_VALUES, { ...LABEL_VALUES })).toEqual([]);
  });

  it("reports each edited field with its label and both figures, in label order", () => {
    const edited = { ...LABEL_VALUES, saltG: "0.2", fatG: "3" };
    expect(changedNutritionFields(LABEL_VALUES, edited)).toEqual([
      { field: "fatG", label: "Fat (g)", from: "2", to: "3" },
      { field: "saltG", label: "Salt (g)", from: "0.18", to: "0.2" },
    ]);
  });

  it("ignores a value retyped in a different form but equal in number", () => {
    // "2" -> "2.0" is not a correction, and showing it as one would teach the
    // user to distrust the preview.
    expect(changedNutritionFields(LABEL_VALUES, { ...LABEL_VALUES, fatG: "2.0" })).toEqual([]);
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
