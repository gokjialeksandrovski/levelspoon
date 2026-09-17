import { describe, expect, it } from "vitest";

import type { MeasureContext } from "./resolve-grams";
import { resolveQuantity } from "./resolve-quantity";

const GRAMS_BASIS: MeasureContext = {
  productName: "Test",
  densityGMl: null,
  servingUnit: null,
  servingGrams: null,
  nutritionBasisUnit: "g",
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
    // these products, Task 1) but resolveQuantity's own contract shouldn't
    // depend on that - "g" always means "resolve as a mass", never a
    // literal count of the product's basis unit.
    expect(resolveQuantity("5", "g", TBSP_BASIS)).toEqual({ kind: "resolved", quantity: 5, quantityUnit: "g" });
  });
});
