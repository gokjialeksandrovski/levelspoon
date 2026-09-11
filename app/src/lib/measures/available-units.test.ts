import { describe, expect, it } from "vitest";

import { availableUnits, defaultUnit } from "./available-units";
import type { MeasureContext } from "./resolve-grams";

const EMPTY_CONTEXT: MeasureContext = {
  productName: "",
  densityGMl: null,
  servingUnit: null,
  servingGrams: null,
};

const contextFor = (overrides: Partial<MeasureContext>): MeasureContext => ({
  ...EMPTY_CONTEXT,
  ...overrides,
});

describe("availableUnits", () => {
  it("offers only grams for a product with nothing learned", () => {
    expect(availableUnits(EMPTY_CONTEXT)).toEqual(["g"]);
  });

  it("adds the product's own serving unit verbatim", () => {
    const context = contextFor({ servingUnit: "bar", servingGrams: 52 });
    expect(availableUnits(context)).toEqual(["bar", "g"]);
  });

  it("adds tbsp/tsp/ml when a stored density is present", () => {
    const context = contextFor({ densityGMl: 1.2333, productName: "Honey" });
    expect(availableUnits(context)).toEqual(["g", "tbsp", "tsp", "ml"]);
  });

  it("adds tbsp/tsp/ml when only the seeded density table resolves the name", () => {
    const context = contextFor({ productName: "Olive Oil" });
    expect(availableUnits(context)).toEqual(["g", "tbsp", "tsp", "ml"]);
  });

  it("does not add tbsp/tsp/ml when the name is ambiguous in the seeded table", () => {
    // "Butter Milk" matches two unrelated seeded keys - seededDensity itself
    // returns null for this (densities.ts's own documented case).
    const context = contextFor({ productName: "Butter Milk" });
    expect(availableUnits(context)).toEqual(["g"]);
  });

  it("combines a serving unit and a density without duplicates", () => {
    const context = contextFor({ servingUnit: "bottle", servingGrams: 500, densityGMl: 0.92 });
    expect(availableUnits(context)).toEqual(["bottle", "g", "tbsp", "tsp", "ml"]);
  });
});

describe("defaultUnit", () => {
  it("is the product's serving unit when present", () => {
    expect(defaultUnit(contextFor({ servingUnit: "bar", servingGrams: 52 }))).toBe("bar");
  });

  it("is grams when nothing is learned", () => {
    expect(defaultUnit(EMPTY_CONTEXT)).toBe("g");
  });
});
