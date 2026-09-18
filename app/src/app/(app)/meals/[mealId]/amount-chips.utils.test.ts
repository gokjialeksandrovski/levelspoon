import { describe, expect, it } from "vitest";

import { chipLabel, isChipSelected, portionChips } from "./amount-chips.utils";

describe("portionChips", () => {
  it("offers one chip per portion, each at a count of one", () => {
    expect(
      portionChips([
        { label: "slice", grams: 28 },
        { label: "slice, large", grams: 38 },
      ]),
    ).toEqual([
      { count: 1, unit: "slice", grams: 28 },
      { count: 1, unit: "slice, large", grams: 38 },
    ]);
  });

  it("offers nothing for a product with no portions", () => {
    expect(portionChips([])).toEqual([]);
  });
});

describe("chipLabel", () => {
  it("prints the count, the unit and the gram weight", () => {
    expect(chipLabel({ count: 1, unit: "slice", grams: 28 })).toBe("1 slice · 28 g");
  });

  it("prints a gram chip once, not as its own weight twice", () => {
    expect(chipLabel({ count: 100, unit: "g", grams: 100 })).toBe("100 g");
  });

  it("rounds a fractional gram weight to the nearest gram", () => {
    expect(chipLabel({ count: 0.5, unit: "slice", grams: 13.5 })).toBe("0.5 slice · 14 g");
  });

  it("prints a multi-word portion label whole", () => {
    expect(chipLabel({ count: 2, unit: "extra large", grams: 136 })).toBe("2 extra large · 136 g");
  });
});

describe("isChipSelected", () => {
  it("matches the field's current count and unit", () => {
    const chip = { count: 1, unit: "slice", grams: 28 };
    expect(isChipSelected(chip, "1", "slice")).toBe(true);
  });

  it("does not match a different count or a different unit", () => {
    const chip = { count: 1, unit: "slice", grams: 28 };
    expect(isChipSelected(chip, "2", "slice")).toBe(false);
    expect(isChipSelected(chip, "1", "g")).toBe(false);
  });

  it("treats an unparseable or empty count as no selection", () => {
    const chip = { count: 1, unit: "slice", grams: 28 };
    expect(isChipSelected(chip, "", "slice")).toBe(false);
    expect(isChipSelected(chip, "  ", "slice")).toBe(false);
  });

  it("ignores surrounding whitespace and a trailing zero", () => {
    const chip = { count: 1, unit: "slice", grams: 28 };
    expect(isChipSelected(chip, " 1.0 ", "slice")).toBe(true);
  });
});
