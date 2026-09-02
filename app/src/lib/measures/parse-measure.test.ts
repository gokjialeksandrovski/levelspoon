import { describe, expect, it } from "vitest";

import { parseMeasure } from "./parse-measure";

describe("parseMeasure", () => {
  it("reads a whole number with a canonical unit", () => {
    expect(parseMeasure("2 tbsp")).toEqual({ quantity: 2, unit: "tbsp" });
  });

  it("reads a mixed number", () => {
    expect(parseMeasure("1 1/2 cups")).toEqual({ quantity: 1.5, unit: "cup" });
  });

  it("reads a bare fraction", () => {
    expect(parseMeasure("1/2 cup")).toEqual({ quantity: 0.5, unit: "cup" });
  });

  it("reads a decimal point", () => {
    expect(parseMeasure("1.5 oz")).toEqual({ quantity: 1.5, unit: "oz" });
  });

  it("reads a decimal comma", () => {
    expect(parseMeasure("1,5 oz")).toEqual({ quantity: 1.5, unit: "oz" });
  });

  it("prefers the longest alias so 'fl oz' beats 'oz'", () => {
    expect(parseMeasure("8 fl oz")).toEqual({ quantity: 8, unit: "fl oz" });
  });

  it("normalises a spelled-out alias to its canonical name", () => {
    expect(parseMeasure("2 Tablespoons")).toEqual({ quantity: 2, unit: "tbsp" });
  });

  it("takes the leftmost measure, so a printed gram weight does not displace the household measure", () => {
    expect(parseMeasure("2 Tbsp (37g)")).toEqual({ quantity: 2, unit: "tbsp" });
  });

  it("returns an unrecognised unit token verbatim and lowercased", () => {
    expect(parseMeasure("1 bas")).toEqual({ quantity: 1, unit: "bas" });
  });

  it("returns an unrecognised count unit rather than reading it as grams", () => {
    expect(parseMeasure("4 gummies")).toEqual({ quantity: 4, unit: "gummies" });
  });

  it("returns null when there is no quantity at all", () => {
    expect(parseMeasure("Serving size")).toBeNull();
  });

  it("returns null when there is a quantity but no unit token", () => {
    expect(parseMeasure("250")).toBeNull();
  });
});
