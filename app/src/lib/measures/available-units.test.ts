import { describe, expect, it } from "vitest";

import { availableUnits, defaultUnit } from "./available-units";
import type { MeasureContext } from "./resolve-grams";

const EMPTY_CONTEXT: MeasureContext = {
  productName: "",
  densityGMl: null,
  servingUnit: null,
  servingGrams: null,
  nutritionBasisUnit: "g",
  portions: [],
};

const contextFor = (overrides: Partial<MeasureContext>): MeasureContext => ({
  ...EMPTY_CONTEXT,
  ...overrides,
});

describe("availableUnits — grams basis", () => {
  it("offers only grams for a product with nothing learned", () => {
    expect(availableUnits(EMPTY_CONTEXT)).toEqual(["g"]);
  });

  it("adds the product's own serving unit verbatim", () => {
    const context = contextFor({ servingUnit: "bar", servingGrams: 52 });
    expect(availableUnits(context)).toEqual(["bar", "g"]);
  });

  it("adds tbsp/tsp/ml/cup when a stored density is present", () => {
    const context = contextFor({ densityGMl: 1.2333, productName: "Honey" });
    expect(availableUnits(context)).toEqual(["g", "tbsp", "tsp", "ml", "cup"]);
  });

  it("adds tbsp/tsp/ml/cup when only the seeded density table resolves the name", () => {
    const context = contextFor({ productName: "Olive Oil" });
    expect(availableUnits(context)).toEqual(["g", "tbsp", "tsp", "ml", "cup"]);
  });

  it("does not add tbsp/tsp/ml/cup when the name is ambiguous in the seeded table", () => {
    // "Butter Milk" matches two unrelated seeded keys - seededDensity itself
    // returns null for this (densities.ts's own documented case).
    const context = contextFor({ productName: "Butter Milk" });
    expect(availableUnits(context)).toEqual(["g"]);
  });

  // densities.ts seeds flour, sugar, brown sugar and rolled oats so a levelled
  // spoon converts. A cup of those does not follow from the same figure.
  it("withholds cup from a seeded loose solid, keeping the spoon units", () => {
    const context = contextFor({ productName: "Light Brown Sugar" });
    expect(availableUnits(context)).toEqual(["g", "tbsp", "tsp", "ml"]);
  });

  it("offers cup for a loose solid whose own label taught a density", () => {
    // "1/4 cup (30 g)" on the pack is a measured cup, not a table figure.
    const context = contextFor({ productName: "Flour", densityGMl: 0.5 });
    expect(availableUnits(context)).toEqual(["g", "tbsp", "tsp", "ml", "cup"]);
  });

  it("combines a serving unit and a density without duplicates", () => {
    const context = contextFor({ servingUnit: "bottle", servingGrams: 500, densityGMl: 0.92 });
    expect(availableUnits(context)).toEqual(["bottle", "g", "tbsp", "tsp", "ml", "cup"]);
  });
});

describe("availableUnits — non-grams basis", () => {
  it("offers only the basis unit, ignoring a matching serving unit and a known density", () => {
    // A per-unit product's serving unit is always set to the same value as
    // its basis (spec §5), and could coincidentally have a seeded density
    // too - neither should widen the picker past the one unit that's
    // actually convertible to this product's stored nutrition.
    const context = contextFor({
      nutritionBasisUnit: "tbsp",
      servingUnit: "tbsp",
      servingGrams: 15,
      densityGMl: 1.2,
    });
    expect(availableUnits(context)).toEqual(["tbsp"]);
  });

  it("offers only the basis unit for a product with no other measures learned at all", () => {
    const context = contextFor({ nutritionBasisUnit: "bar" });
    expect(availableUnits(context)).toEqual(["bar"]);
  });
});

describe("defaultUnit", () => {
  it("is the product's serving unit when present", () => {
    expect(defaultUnit(contextFor({ servingUnit: "bar", servingGrams: 52 }))).toBe("bar");
  });

  it("is grams when nothing is learned", () => {
    expect(defaultUnit(EMPTY_CONTEXT)).toBe("g");
  });

  it("is already the basis unit for a non-grams product, since servingUnit mirrors it", () => {
    // defaultUnit needs no special case for this (spec §6); this locks that in.
    const context = contextFor({ nutritionBasisUnit: "tbsp", servingUnit: "tbsp" });
    expect(defaultUnit(context)).toBe("tbsp");
  });
});

describe("availableUnits — portions", () => {
  it("lists portion labels ahead of grams", () => {
    const context = contextFor({
      portions: [
        { label: "slice", grams: 28 },
        { label: "slice, large", grams: 38 },
      ],
    });
    expect(availableUnits(context)).toEqual(["slice", "slice, large", "g"]);
  });

  it("does not repeat a label the product's own serving unit already names", () => {
    const context = contextFor({
      servingUnit: "slice",
      servingGrams: 32,
      portions: [{ label: "slice", grams: 28 }],
    });
    expect(availableUnits(context)).toEqual(["slice", "g"]);
  });

  it("ignores portions on a non-grams basis", () => {
    const context = contextFor({
      nutritionBasisUnit: "tbsp",
      servingUnit: "tbsp",
      portions: [{ label: "slice", grams: 28 }],
    });
    expect(availableUnits(context)).toEqual(["tbsp"]);
  });

  it("starts the field on the first portion when one exists", () => {
    const context = contextFor({ portions: [{ label: "medium", grams: 50 }] });
    expect(defaultUnit(context)).toBe("medium");
  });
});
