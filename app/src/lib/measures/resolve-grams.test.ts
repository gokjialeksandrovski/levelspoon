import { describe, expect, it } from "vitest";

import { resolveGrams, type MeasureContext } from "./resolve-grams";

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

describe("resolveGrams — explicit mass", () => {
  it.each([
    ["37g", 37],
    ["500 mg", 0.5],
    ["1.5 kg", 1500],
    ["8 oz", 226.796],
    ["1.5 lb", 680.388],
  ])("converts %s without needing a density", (text, expected) => {
    const result = resolveGrams(text, EMPTY_CONTEXT);
    expect(result).toEqual({ kind: "grams", grams: expect.closeTo(expected, 3), via: "mass" });
  });
});

describe("resolveGrams — volume times density", () => {
  it("uses the product's stored density before the seeded table", () => {
    // 2 x 15 mL x 1.2333 = 36.999 g - the density a "2 Tbsp (37g)" label states.
    const result = resolveGrams("2 tbsp", contextFor({ densityGMl: 1.2333, productName: "Honey" }));
    expect(result).toEqual({ kind: "grams", grams: expect.closeTo(36.999, 3), via: "volume" });
  });

  it("falls back to the seeded table when the product has no stored density", () => {
    // The spec's worked example: 2 cups x 240 mL x 0.53 = 254.4 g.
    const result = resolveGrams("2 cups", contextFor({ productName: "Plain Flour" }));
    expect(result).toEqual({ kind: "grams", grams: expect.closeTo(254.4, 3), via: "volume" });
  });

  it.each([
    ["1 tsp", 5],
    ["1 tbsp", 15],
    ["1 fl oz", 30],
    ["1 cup", 240],
    ["1 pint", 473.176],
    ["1 quart", 946.353],
    ["1 litre", 1000],
    ["1 ml", 1],
  ])("converts %s at water's 1.00 g/mL", (text, expected) => {
    const result = resolveGrams(text, contextFor({ productName: "Spring Water" }));
    expect(result).toEqual({ kind: "grams", grams: expect.closeTo(expected, 3), via: "volume" });
  });

  it("resolves a mixed number through the volume path", () => {
    const result = resolveGrams("1 1/2 cups", contextFor({ productName: "Water" }));
    expect(result).toEqual({ kind: "grams", grams: expect.closeTo(360, 3), via: "volume" });
  });

  it("is unresolved rather than assuming water when the density is unknown", () => {
    const result = resolveGrams("2 tbsp", contextFor({ productName: "Mystery Spread" }));
    expect(result).toEqual({ kind: "unresolved", measureText: "2 tbsp", unitName: "tbsp" });
  });
});

describe("resolveGrams — learned serving weight", () => {
  it("multiplies the stored per-unit weight by the quantity", () => {
    const context = contextFor({ servingUnit: "bar", servingGrams: 52 });
    expect(resolveGrams("2 bars", context)).toEqual({ kind: "grams", grams: 104, via: "learned" });
  });

  it("matches the stored unit case-insensitively and ignores a plural s", () => {
    const context = contextFor({ servingUnit: "Bar", servingGrams: 52 });
    expect(resolveGrams("1 bar", context)).toEqual({ kind: "grams", grams: 52, via: "learned" });
  });

  it("does not apply a stored weight to a different unit", () => {
    const context = contextFor({ servingUnit: "bar", servingGrams: 52 });
    expect(resolveGrams("2 cookies", context)).toEqual({
      kind: "unresolved",
      measureText: "2 cookies",
      unitName: "cookies",
    });
  });
});

describe("resolveGrams — unresolved", () => {
  it("reports the unit name for an unknown count unit", () => {
    expect(resolveGrams("4 gummies", EMPTY_CONTEXT)).toEqual({
      kind: "unresolved",
      measureText: "4 gummies",
      unitName: "gummies",
    });
  });

  it("does not read '4 gummies' as 4 grams", () => {
    const result = resolveGrams("4 gummies", EMPTY_CONTEXT);
    expect(result.kind).toBe("unresolved");
  });

  it("reports a null unit name when nothing parses at all", () => {
    expect(resolveGrams("Serving size", EMPTY_CONTEXT)).toEqual({
      kind: "unresolved",
      measureText: "Serving size",
      unitName: null,
    });
  });

  it("is unresolved for a non-positive mass rather than returning zero grams", () => {
    expect(resolveGrams("0g", EMPTY_CONTEXT)).toEqual({
      kind: "unresolved",
      measureText: "0g",
      unitName: "g",
    });
  });
});
