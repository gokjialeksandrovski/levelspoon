import { describe, expect, it } from "vitest";

import {
  canEstimate,
  DESCRIPTION_MAX_LENGTH,
  isDescriptionTooLong,
  isPlausibleItem,
  parseMealEstimate,
  quantitySourceFor,
  withAiEstimateTag,
  type EstimatedItem,
} from "./lazy-track.utils";

const chicken: EstimatedItem = {
  name: "Chicken breast",
  grams: 150,
  per100g: { energyKcal: 165, fatG: 3.6, saturatesG: 1, carbohydrateG: 0, sugarsG: 0, proteinG: 31, saltG: 0.2, fibreG: 0, alcoholG: 0 },
};

const withFigures = (patch: Partial<EstimatedItem["per100g"]>): EstimatedItem => ({ ...chicken, per100g: { ...chicken.per100g, ...patch } });

describe("isPlausibleItem", () => {
  it("accepts a realistic item", () => expect(isPlausibleItem(chicken)).toBe(true));
  it("accepts pure oil at the physical limits", () =>
    expect(isPlausibleItem(withFigures({ energyKcal: 884, fatG: 100, saturatesG: 14, proteinG: 0, saltG: 0, fibreG: null }))).toBe(true));
  it("refuses zero grams", () => expect(isPlausibleItem({ ...chicken, grams: 0 })).toBe(false));
  it("refuses grams above the cap", () => expect(isPlausibleItem({ ...chicken, grams: 5001 })).toBe(false));
  it("refuses a negative figure", () => expect(isPlausibleItem(withFigures({ proteinG: -1 }))).toBe(false));
  it("refuses macros over 100 g per 100 g", () => expect(isPlausibleItem(withFigures({ fatG: 50, proteinG: 51 }))).toBe(false));
  // A US-style reply already folds fibre into carbohydrateG, so counting it
  // again over-totals a real food and drops it.
  it("accepts a peanut-butter-like item whose US-style carbs already include its fibre", () =>
    expect(isPlausibleItem(withFigures({ energyKcal: 588, fatG: 50, carbohydrateG: 20, proteinG: 25, fibreG: 6 }))).toBe(true));
  it("accepts lard at USDA's 902 kcal per 100 g", () =>
    expect(isPlausibleItem(withFigures({ energyKcal: 902, fatG: 100, saturatesG: 39, proteinG: 0, saltG: 0, fibreG: 0 }))).toBe(true));
  it("accepts rounded oil figures a hair over 100 g", () =>
    expect(isPlausibleItem(withFigures({ energyKcal: 884, fatG: 99.9, saturatesG: 14, proteinG: 0.2, saltG: 0, fibreG: 0 }))).toBe(true));
  it("refuses kcal past the fat ceiling and its rounding slack", () => expect(isPlausibleItem(withFigures({ energyKcal: 911 }))).toBe(false));
  it("refuses sugars above carbs", () => expect(isPlausibleItem(withFigures({ carbohydrateG: 5, sugarsG: 6.5 }))).toBe(false));
  it("refuses saturates above fat", () => expect(isPlausibleItem(withFigures({ fatG: 1, saturatesG: 2.5 }))).toBe(false));
  it("refuses sodium milligrams in the salt field", () => expect(isPlausibleItem(withFigures({ saltG: 400 }))).toBe(false));
  it("refuses fibre over 100 g per 100 g", () => expect(isPlausibleItem(withFigures({ fibreG: 150 }))).toBe(false));
  // A burger's per-serving macros (fat 30, carbs 45, protein 25) beside its
  // per-100 g kcal: the grams multiply a figure that never matched them.
  it("refuses kcal far below what its macros carry", () =>
    expect(isPlausibleItem(withFigures({ energyKcal: 257, fatG: 30, saturatesG: 10, carbohydrateG: 45, sugarsG: 8, proteinG: 25, fibreG: 3 }))).toBe(false));
  // The ceiling's mirror of the floor: per-serving kcal (550) beside per-100 g macros.
  it("refuses kcal far above what its macros carry", () =>
    expect(isPlausibleItem(withFigures({ energyKcal: 550, fatG: 13, saturatesG: 5, carbohydrateG: 24, sugarsG: 5, proteinG: 13, fibreG: 1.5 }))).toBe(false));
  it("accepts beer, whose kcal is mostly alcohol", () =>
    expect(isPlausibleItem(withFigures({ energyKcal: 43, fatG: 0, saturatesG: 0, carbohydrateG: 3.6, sugarsG: 0, proteinG: 0.5, saltG: 0, fibreG: 0, alcoholG: 3.9 }))).toBe(true));
  it("accepts spirits", () =>
    expect(isPlausibleItem(withFigures({ energyKcal: 231, fatG: 0, saturatesG: 0, carbohydrateG: 0, sugarsG: 0, proteinG: 0, saltG: 0, fibreG: 0, alcoholG: 33.4 }))).toBe(true));
  it("refuses wine with its alcohol left out", () =>
    expect(isPlausibleItem(withFigures({ energyKcal: 85, fatG: 0, saturatesG: 0, carbohydrateG: 2.6, sugarsG: 0.6, proteinG: 0.1, saltG: 0, fibreG: 0, alcoholG: 0 }))).toBe(false));
  it("accepts vinegar, whose kcal no macro carries", () =>
    expect(isPlausibleItem(withFigures({ energyKcal: 21, fatG: 0, saturatesG: 0, carbohydrateG: 0.9, sugarsG: 0.4, proteinG: 0, saltG: 0, fibreG: 0 }))).toBe(true));
  it("refuses alcohol that overfills 100 g", () => expect(isPlausibleItem(withFigures({ energyKcal: 640, alcoholG: 70 }))).toBe(false));
  it("accepts black coffee, whose few kcal round to almost nothing", () =>
    expect(isPlausibleItem(withFigures({ energyKcal: 1, fatG: 0, saturatesG: 0, carbohydrateG: 0, sugarsG: 0, proteinG: 0.1, saltG: 0, fibreG: 0 }))).toBe(true));
  it("refuses a non-finite figure", () => expect(isPlausibleItem(withFigures({ energyKcal: Number.NaN }))).toBe(false));
  it("refuses a blank name", () => expect(isPlausibleItem({ ...chicken, name: "  " })).toBe(false));
});

describe("parseMealEstimate", () => {
  it("keeps good items and counts the bad ones it drops", () => {
    const result = parseMealEstimate({ mealName: "Bowl", items: [chicken, { ...chicken, grams: -5 }] });
    expect(result).toEqual({ mealName: "Bowl", items: [chicken], droppedCount: 1 });
  });

  it("keeps a null fibre as null", () => {
    const result = parseMealEstimate({ mealName: "Bowl", items: [withFigures({ fibreG: null })] });
    expect(result.items[0].per100g.fibreG).toBeNull();
  });

  it("returns no items for junk", () => {
    expect(parseMealEstimate("nope").items).toEqual([]);
    expect(parseMealEstimate({ mealName: "x", items: "no" }).items).toEqual([]);
    expect(parseMealEstimate({ mealName: "x", items: [{ name: "a" }] }).items).toEqual([]);
  });

  it("falls back to a generic meal name", () => {
    expect(parseMealEstimate({ items: [chicken] }).mealName).toBe("Meal");
  });

  it("trims names", () => {
    expect(parseMealEstimate({ mealName: " Bowl ", items: [{ ...chicken, name: " Chicken " }] })).toEqual({
      mealName: "Bowl",
      items: [{ ...chicken, name: "Chicken" }],
      droppedCount: 0,
    });
  });
});

describe("description rules", () => {
  it("needs text or a photo", () => {
    expect(canEstimate("  ", false)).toBe(false);
    expect(canEstimate("", true)).toBe(true);
    expect(canEstimate("pasta", false)).toBe(true);
  });

  it("refuses text past the limit", () => {
    expect(isDescriptionTooLong("a".repeat(DESCRIPTION_MAX_LENGTH))).toBe(false);
    expect(isDescriptionTooLong("a".repeat(DESCRIPTION_MAX_LENGTH + 1))).toBe(true);
    expect(canEstimate("a".repeat(DESCRIPTION_MAX_LENGTH + 1), true)).toBe(false);
  });
});

describe("quantitySourceFor", () => {
  it("keeps untouched grams as ai_estimated", () => expect(quantitySourceFor(false)).toBe("ai_estimated"));
  it("marks edited grams manual", () => expect(quantitySourceFor(true)).toBe("manual"));
});

describe("withAiEstimateTag", () => {
  it("suffixes only a guess", () => {
    expect(withAiEstimateTag("Bowl", true)).toBe("Bowl (AI estimate)");
    expect(withAiEstimateTag("Bowl", false)).toBe("Bowl");
  });
});
