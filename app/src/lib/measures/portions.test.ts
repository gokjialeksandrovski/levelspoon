import { describe, expect, it } from "vitest";

import { PORTION_CLASSES, portionsForClass } from "./portions";

describe("portionsForClass", () => {
  it("gives a bread class a regular and a large slice", () => {
    expect(portionsForClass("bread-slice")).toEqual([
      { label: "slice", grams: 28 },
      { label: "slice, large", grams: 38 },
    ]);
  });

  it("gives an egg the four EU grades in edible grams", () => {
    expect(portionsForClass("egg")).toEqual([
      { label: "small", grams: 44 },
      { label: "medium", grams: 50 },
      { label: "large", grams: 58 },
      { label: "extra large", grams: 68 },
    ]);
  });

  it("gives each cup class its own food's weight", () => {
    expect(portionsForClass("cup-rice-white-cooked")).toEqual([{ label: "cup", grams: 158 }]);
    expect(portionsForClass("cup-oatmeal-cooked")).toEqual([{ label: "cup", grams: 234 }]);
  });

  it("lists every class exactly once", () => {
    expect(new Set(PORTION_CLASSES).size).toBe(PORTION_CLASSES.length);
  });

  it("gives every listed class at least one portion", () => {
    for (const portionClass of PORTION_CLASSES) {
      expect(portionsForClass(portionClass).length).toBeGreaterThan(0);
    }
  });

  it("never states a non-positive gram figure", () => {
    for (const portionClass of PORTION_CLASSES) {
      for (const portion of portionsForClass(portionClass)) {
        expect(portion.grams).toBeGreaterThan(0);
      }
    }
  });
});
