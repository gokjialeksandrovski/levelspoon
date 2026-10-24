import { describe, expect, it } from "vitest";

import { MAX_ITEM_GRAMS } from "@/features/lazy-track/actions/lazy-track.utils";

import { droppedItemsNotice, gramsFieldError, parseGrams, reviewDraftIsLoggable, rowKcal, toLoggedItems, toReviewRows } from "./lazy-track-steps.utils";

const rice = {
  name: "Rice",
  grams: 200,
  per100g: { energyKcal: 130, fatG: 0.3, saturatesG: 0.1, carbohydrateG: 28, sugarsG: 0.1, proteinG: 2.7, saltG: 0, fibreG: 0.4, alcoholG: 0 },
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

  it("refuses grams above the cap", () => {
    expect(parseGrams(String(MAX_ITEM_GRAMS))).toBe(MAX_ITEM_GRAMS);
    expect(parseGrams(String(MAX_ITEM_GRAMS + 1))).toBeNull();
  });

  it("is loggable only with at least one row and every grams valid", () => {
    expect(reviewDraftIsLoggable([])).toBe(false);
    expect(reviewDraftIsLoggable([{ item: rice, gramsText: "" }])).toBe(false);
    expect(reviewDraftIsLoggable([{ item: rice, gramsText: "150" }])).toBe(true);
    expect(reviewDraftIsLoggable([{ item: rice, gramsText: String(MAX_ITEM_GRAMS + 1) }])).toBe(false);
  });

  it("names the actual limit for grams over the cap, distinct from a blank or zero", () => {
    expect(gramsFieldError(String(MAX_ITEM_GRAMS + 1))).toBe(`Enter ${MAX_ITEM_GRAMS} g or less.`);
    expect(gramsFieldError("0")).toBe("Enter an amount above 0.");
    expect(gramsFieldError("")).toBe("Enter an amount above 0.");
    expect(gramsFieldError("150")).toBeUndefined();
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

describe("droppedItemsNotice", () => {
  it("counts one item or several", () => {
    expect(droppedItemsNotice(1)).toBe("1 item was left out because its figures didn't add up. Add it by search after logging.");
    expect(droppedItemsNotice(2)).toBe("2 items were left out because their figures didn't add up. Add them by search after logging.");
  });
});
