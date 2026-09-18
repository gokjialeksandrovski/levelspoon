import { describe, expect, it } from "vitest";

import { resolvePortions, type PortionSource } from "./resolve-portions";

const sourceFor = (overrides: Partial<PortionSource>): PortionSource => ({
  standardSlug: null,
  nameSearch: "",
  servingUnit: null,
  servingGrams: null,
  nutritionBasisUnit: "g",
  overrides: {},
  ...overrides,
});

describe("resolvePortions", () => {
  it("gives a curated bread its class portions", () => {
    expect(resolvePortions(sourceFor({ standardSlug: "bread-white" }))).toEqual([
      { label: "slice", grams: 28 },
      { label: "slice, large", grams: 38 },
    ]);
  });

  it("prefers the product's own serving weight over the class default", () => {
    const source = sourceFor({
      standardSlug: "bread-whole-wheat",
      servingUnit: "slice",
      servingGrams: 32,
    });
    expect(resolvePortions(source)).toEqual([
      { label: "slice", grams: 32 },
      { label: "slice, large", grams: 38 },
    ]);
  });

  it("prefers a user override over both", () => {
    const source = sourceFor({
      standardSlug: "bread-whole-wheat",
      servingUnit: "slice",
      servingGrams: 32,
      overrides: { slice: 45 },
    });
    expect(resolvePortions(source)).toEqual([
      { label: "slice", grams: 45 },
      { label: "slice, large", grams: 38 },
    ]);
  });

  it("falls back to the name when there is no slug", () => {
    expect(resolvePortions(sourceFor({ nameSearch: "zito bread toast" }))).toEqual([
      { label: "slice", grams: 28 },
      { label: "slice, large", grams: 38 },
    ]);
  });

  it("prefers the slug over the name when both resolve", () => {
    const source = sourceFor({ standardSlug: "egg-boiled", nameSearch: "egg bread" });
    expect(resolvePortions(source)).toEqual([
      { label: "small", grams: 44 },
      { label: "medium", grams: 50 },
      { label: "large", grams: 58 },
      { label: "extra large", grams: 68 },
    ]);
  });

  it("returns nothing for a product neither route classifies", () => {
    expect(resolvePortions(sourceFor({ nameSearch: "chicken breast raw" }))).toEqual([]);
  });

  it("returns nothing for a product whose nutrition is not per gram", () => {
    const source = sourceFor({ standardSlug: "bread-white", nutritionBasisUnit: "tbsp" });
    expect(resolvePortions(source)).toEqual([]);
  });

  it("ignores an override for a label this product does not have", () => {
    const source = sourceFor({ standardSlug: "bread-white", overrides: { wedge: 60 } });
    expect(resolvePortions(source)).toEqual([
      { label: "slice", grams: 28 },
      { label: "slice, large", grams: 38 },
    ]);
  });
});
