import { describe, expect, it } from "vitest";

import { parseGrams, reviewDraftIsLoggable, rowKcal, toLoggedItems, toReviewRows } from "./lazy-track-steps.utils";

const rice = {
  name: "Rice",
  grams: 200,
  per100g: { energyKcal: 130, fatG: 0.3, saturatesG: 0.1, carbohydrateG: 28, sugarsG: 0.1, proteinG: 2.7, saltG: 0, fibreG: 0.4 },
};

describe("review draft", () => {
  it("starts from Gemini's grams", () => {
    expect(toReviewRows([rice])).toEqual([{ item: rice, gramsText: "200" }]);
  });

  it("parses decimal commas and refuses blanks and zero", () => {
    expect(parseGrams("12,5")).toBe(12.5);
    expect(parseGrams("")).toBeNull();
    expect(parseGrams("0")).toBeNull();
    expect(parseGrams("abc")).toBeNull();
  });

  it("is loggable only with at least one row and every grams valid", () => {
    expect(reviewDraftIsLoggable([])).toBe(false);
    expect(reviewDraftIsLoggable([{ item: rice, gramsText: "" }])).toBe(false);
    expect(reviewDraftIsLoggable([{ item: rice, gramsText: "150" }])).toBe(true);
  });

  it("marks an edited amount and keeps an untouched one", () => {
    expect(toLoggedItems([{ item: rice, gramsText: "200" }, { item: rice, gramsText: "150" }])).toEqual([
      { ...rice, gramsEdited: false },
      { ...rice, grams: 150, gramsEdited: true },
    ]);
  });

  it("prices a row from its typed grams", () => {
    expect(rowKcal({ item: rice, gramsText: "100" })).toBe(130);
    expect(rowKcal({ item: rice, gramsText: "" })).toBeNull();
  });
});
