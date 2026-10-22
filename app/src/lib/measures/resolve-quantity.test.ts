import { describe, expect, it } from "vitest";

import type { MeasureContext } from "./resolve-grams";
import { resolveQuantity } from "./resolve-quantity";

const GRAMS_BASIS: MeasureContext = {
  productName: "Test",
  densityGMl: null,
  servingUnit: null,
  servingGrams: null,
  nutritionBasisUnit: "g",
  portions: [],
};

describe("resolveQuantity — grams basis", () => {
  it("resolves an explicit mass to grams", () => {
    expect(resolveQuantity("150", "g", GRAMS_BASIS)).toEqual({ kind: "resolved", quantity: 150, quantityUnit: "g" });
  });

  it("resolves a learned serving unit through to grams", () => {
    const context = { ...GRAMS_BASIS, servingUnit: "bar", servingGrams: 52 };
    expect(resolveQuantity("2", "bar", context)).toEqual({ kind: "resolved", quantity: 104, quantityUnit: "g" });
  });

  it("is unresolved for a unit resolveGrams cannot place", () => {
    expect(resolveQuantity("2", "gummies", GRAMS_BASIS)).toEqual({ kind: "unresolved" });
  });

  it("is unresolved for a non-positive mass", () => {
    expect(resolveQuantity("0", "g", GRAMS_BASIS)).toEqual({ kind: "unresolved" });
  });

  // parseMeasure's regex carries no sign, so "-50 g" would otherwise read as
  // 50 g and silently save a negative typed amount as a positive one.
  it("is unresolved for a negative count", () => {
    expect(resolveQuantity("-50", "g", GRAMS_BASIS)).toEqual({ kind: "unresolved" });
  });

  it("is unresolved for a count that is not a number", () => {
    expect(resolveQuantity("abc", "g", GRAMS_BASIS)).toEqual({ kind: "unresolved" });
  });
});

describe("resolveQuantity — non-grams basis", () => {
  const TBSP_BASIS: MeasureContext = {
    productName: "Nutella",
    densityGMl: null,
    servingUnit: "tbsp",
    servingGrams: null,
    nutritionBasisUnit: "tbsp",
    portions: [],
  };

  it("saves the count directly in the basis unit, skipping resolveGrams entirely", () => {
    // No density on this context - resolveGrams would fail to convert
    // "tbsp" to grams, proving this path never calls it.
    expect(resolveQuantity("2", "tbsp", TBSP_BASIS)).toEqual({ kind: "resolved", quantity: 2, quantityUnit: "tbsp" });
  });

  it("is unresolved for a non-positive count in the basis unit", () => {
    expect(resolveQuantity("0", "tbsp", TBSP_BASIS)).toEqual({ kind: "unresolved" });
  });

  it("still takes the grams path when the selected unit is g, even on a non-grams-basis product", () => {
    // Not reachable through the UI today (availableUnits excludes "g" for
    // these products) but resolveQuantity's own contract shouldn't
    // depend on that - "g" always means "resolve as a mass", never a
    // literal count of the product's basis unit.
    expect(resolveQuantity("5", "g", TBSP_BASIS)).toEqual({ kind: "resolved", quantity: 5, quantityUnit: "g" });
  });
});

describe("resolveQuantity — portions", () => {
  const breadContext: MeasureContext = {
    productName: "Bread, white",
    densityGMl: null,
    servingUnit: null,
    servingGrams: null,
    nutritionBasisUnit: "g",
    portions: [
      { label: "slice", grams: 28 },
      { label: "slice, large", grams: 38 },
    ],
  };

  it("multiplies a tapped portion by its count", () => {
    expect(resolveQuantity("2", "slice", breadContext)).toEqual({
      kind: "resolved",
      quantity: 56,
      quantityUnit: "g",
    });
  });

  it("matches a multi-word portion label that parseMeasure could not", () => {
    expect(resolveQuantity("1", "slice, large", breadContext)).toEqual({
      kind: "resolved",
      quantity: 38,
      quantityUnit: "g",
    });
  });

  it("accepts a fractional count", () => {
    expect(resolveQuantity("0.5", "slice", breadContext)).toEqual({
      kind: "resolved",
      quantity: 14,
      quantityUnit: "g",
    });
  });

  it("leaves a label this product does not carry unresolved", () => {
    expect(resolveQuantity("1", "wedge", breadContext)).toEqual({ kind: "unresolved" });
  });

  it("rejects a zero or negative count", () => {
    expect(resolveQuantity("0", "slice", breadContext)).toEqual({ kind: "unresolved" });
    expect(resolveQuantity("-1", "slice", breadContext)).toEqual({ kind: "unresolved" });
  });

  it("ignores portions on a per-unit product, whose basis is not grams", () => {
    const perUnit: MeasureContext = {
      ...breadContext,
      nutritionBasisUnit: "tbsp",
      servingUnit: "tbsp",
    };
    expect(resolveQuantity("1", "slice", perUnit)).toEqual({ kind: "unresolved" });
  });

  it("still resolves grams when portions are present", () => {
    expect(resolveQuantity("100", "g", breadContext)).toEqual({
      kind: "resolved",
      quantity: 100,
      quantityUnit: "g",
    });
  });
});

describe("resolveQuantity — cup", () => {
  it("converts a cup through the product's density", () => {
    const context: MeasureContext = {
      ...GRAMS_BASIS,
      productName: "Olive oil",
      densityGMl: 0.92,
    };
    // 240 mL (the FDA labeling cup) x 0.92 g/mL
    const resolution = resolveQuantity("1", "cup", context);
    expect(resolution).toMatchObject({ kind: "resolved", quantityUnit: "g" });
    expect(resolution).toHaveProperty("quantity", expect.closeTo(220.8));
  });

  it("leaves a cup unresolved when no density is known", () => {
    expect(resolveQuantity("1", "cup", GRAMS_BASIS)).toEqual({ kind: "unresolved" });
  });
});
