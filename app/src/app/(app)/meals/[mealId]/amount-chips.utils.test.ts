import { describe, expect, it } from "vitest";

import { chipLabel, formatGrams, isChipSelected, mergeChips, portionChips, quantityText, unitsForSelect } from "./amount-chips.utils";

describe("portionChips", () => {
  it("offers one chip per portion, each at a count of one", () => {
    expect(
      portionChips([
        { label: "slice", grams: 28 },
        { label: "slice, large", grams: 38 },
      ]),
    ).toEqual([
      { count: 1, unit: "slice", grams: 28, source: "standard" },
      { count: 1, unit: "slice, large", grams: 38, source: "standard" },
    ]);
  });

  it("offers nothing for a product with no portions", () => {
    expect(portionChips([])).toEqual([]);
  });
});

describe("chipLabel", () => {
  it("prints the count, the unit and the gram weight", () => {
    expect(chipLabel({ count: 1, unit: "slice", grams: 28, source: "standard" as const })).toBe("1 slice · 28 g");
  });

  it("prints a gram chip once, not as its own weight twice", () => {
    expect(chipLabel({ count: 100, unit: "g", grams: 100, source: "recent" })).toBe("100 g");
  });

  it("rounds a fractional gram weight to the nearest gram", () => {
    expect(chipLabel({ count: 0.5, unit: "slice", grams: 13.5, source: "standard" })).toBe("0.5 slice · 14 g");
  });

  it("prints a multi-word portion label whole", () => {
    expect(chipLabel({ count: 2, unit: "extra large", grams: 136, source: "recent" })).toBe("2 extra large · 136 g");
  });
});

describe("isChipSelected", () => {
  it("matches the field's current count and unit", () => {
    const chip = { count: 1, unit: "slice", grams: 28, source: "standard" as const };
    expect(isChipSelected(chip, "1", "slice")).toBe(true);
  });

  it("does not match a different count or a different unit", () => {
    const chip = { count: 1, unit: "slice", grams: 28, source: "standard" as const };
    expect(isChipSelected(chip, "2", "slice")).toBe(false);
    expect(isChipSelected(chip, "1", "g")).toBe(false);
  });

  it("treats an unparseable or empty count as no selection", () => {
    const chip = { count: 1, unit: "slice", grams: 28, source: "standard" as const };
    expect(isChipSelected(chip, "", "slice")).toBe(false);
    expect(isChipSelected(chip, "  ", "slice")).toBe(false);
  });

  it("ignores surrounding whitespace and a trailing zero", () => {
    const chip = { count: 1, unit: "slice", grams: 28, source: "standard" as const };
    expect(isChipSelected(chip, " 1.0 ", "slice")).toBe(true);
  });
});

describe("mergeChips", () => {
  const portions = [
    { label: "slice", grams: 28 },
    { label: "slice, large", grams: 38 },
  ];

  it("shows portions alone when there is no history", () => {
    expect(mergeChips([], portions)).toEqual([
      { count: 1, unit: "slice", grams: 28, source: "standard" },
      { count: 1, unit: "slice, large", grams: 38, source: "standard" },
    ]);
  });

  it("puts recents first and drops the portion chip they duplicate", () => {
    const recents = [{ count: 2, unit: "slice", grams: 64 }];
    expect(mergeChips(recents, portions)).toEqual([
      { count: 2, unit: "slice", grams: 64, source: "recent" },
      { count: 1, unit: "slice, large", grams: 38, source: "standard" },
    ]);
  });

  it("keeps a recent unit that is not a portion at all", () => {
    const recents = [{ count: 100, unit: "g", grams: 100 }];
    expect(mergeChips(recents, portions)).toEqual([
      { count: 100, unit: "g", grams: 100, source: "recent" },
      { count: 1, unit: "slice", grams: 28, source: "standard" },
      { count: 1, unit: "slice, large", grams: 38, source: "standard" },
    ]);
  });

  it("shows recents alone for a product with no portions", () => {
    const recents = [{ count: 100, unit: "g", grams: 100 }];
    expect(mergeChips(recents, [])).toEqual([{ count: 100, unit: "g", grams: 100, source: "recent" }]);
  });

  // The egg case: a curated "1 medium · 50 g" beside a
  // "1 large · 50 g" the user taught. Same weight, different labels, and the
  // source tag is the only thing that can tell the two clusters apart.
  it("marks who supplied each figure, the user or the standard", () => {
    const recents = [{ count: 1, unit: "large", grams: 50 }];
    const eggPortions = [
      { label: "medium", grams: 50 },
      { label: "large", grams: 58 },
    ];
    expect(mergeChips(recents, eggPortions).map((chip) => chip.source)).toEqual(["recent", "standard"]);
  });

  it("keeps two counts of one unit and still drops that unit's portion chip once", () => {
    const recents = [
      { count: 2, unit: "slice", grams: 56 },
      { count: 1, unit: "slice", grams: 28 },
    ];
    expect(mergeChips(recents, portions)).toEqual([
      { count: 2, unit: "slice", grams: 56, source: "recent" },
      { count: 1, unit: "slice", grams: 28, source: "recent" },
      { count: 1, unit: "slice, large", grams: 38, source: "standard" },
    ]);
  });

  it("prefers the recent weight over the standard one for the same unit", () => {
    const recents = [{ count: 1, unit: "slice", grams: 32 }];
    expect(mergeChips(recents, portions)[0]).toEqual({ count: 1, unit: "slice", grams: 32, source: "recent" });
  });
});

describe("quantityText", () => {
  it("prints the user's own words with the weight behind them", () => {
    expect(quantityText(28, "g", 1, "slice")).toBe("1 slice · 28 g");
  });

  it("prints grams once when that is what was entered", () => {
    expect(quantityText(150, "g", 150, "g")).toBe("150 g");
  });

  it("falls back to the stored quantity for a row logged before entry was recorded", () => {
    expect(quantityText(150, "g", null, null)).toBe("150 g");
  });

  it("keeps the decimal of a resolved weight instead of rounding it away", () => {
    expect(quantityText(13.8, "g", 1, "tbsp")).toBe("1 tbsp · 13.8 g");
  });

  it("keeps a per-unit product's own basis unit", () => {
    expect(quantityText(2, "tbsp", 2, "tbsp")).toBe("2 tbsp");
  });
});

describe("formatGrams", () => {
  it("keeps one decimal when the weight has one", () => {
    expect(formatGrams(13.8)).toBe("13.8");
  });

  it("drops a trailing zero", () => {
    expect(formatGrams(28)).toBe("28");
    expect(formatGrams(45.0)).toBe("45");
  });

  it("rounds past one decimal", () => {
    expect(formatGrams(13.83)).toBe("13.8");
  });
});

describe("unitsForSelect", () => {
  const chips = [{ count: 1, unit: "slice", grams: 28, source: "standard" as const }];

  it("drops a unit already offered as a chip", () => {
    expect(unitsForSelect(["slice", "g"], chips, "g")).toEqual(["g"]);
  });

  it("keeps the unit in play so the select can show its own value", () => {
    expect(unitsForSelect(["slice", "g"], chips, "slice")).toEqual(["slice", "g"]);
  });

  it("leaves every unit when there are no chips", () => {
    expect(unitsForSelect(["g", "ml"], [], "g")).toEqual(["g", "ml"]);
  });
});
