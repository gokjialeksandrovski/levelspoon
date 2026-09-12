import { describe, expect, it } from "vitest";

import { resolveNetWeightGrams } from "./net-weight";

const EMPTY_CONTEXT = { productName: "", densityGMl: null, servingUnit: null, servingGrams: null, nutritionBasisUnit: "g" };

describe("resolveNetWeightGrams", () => {
  it("reads the bracketed metric conversion even when OCR misreads the primary unit", () => {
    // Real capture: PaddleOCR read "OZ" as "0Z" (a zero, not the letter O)
    // on the reported photo, which silently breaks parseMeasure's usual
    // unit matching - the bracketed grams figure is untouched by that.
    expect(resolveNetWeightGrams("NET WT 1.86 0Z (52.7g)", EMPTY_CONTEXT)).toBeCloseTo(52.7, 5);
  });

  it("prefers the bracketed grams figure even when the primary unit reads cleanly", () => {
    expect(resolveNetWeightGrams("NET WT 1.86 OZ (52.7g)", EMPTY_CONTEXT)).toBeCloseTo(52.7, 5);
  });

  it("falls back to the primary unit when there is no bracketed conversion", () => {
    expect(resolveNetWeightGrams("NET WT 12 OZ", EMPTY_CONTEXT)).toBeCloseTo(340.194, 3);
  });

  it("returns null when nothing in the text resolves to a weight", () => {
    expect(resolveNetWeightGrams("NET WT one bar", EMPTY_CONTEXT)).toBeNull();
  });
});
