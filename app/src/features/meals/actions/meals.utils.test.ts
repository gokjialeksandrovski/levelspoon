import { describe, expect, it } from "vitest";

import type { MeasureContext } from "@/lib/measures/resolve-grams";
import type { NutritionValues } from "@/types/nutrition";

import { previewContribution } from "./meals.utils";

// Per 100 g, deliberately asymmetric so a wrong scale factor can't coincide
// with a right one.
const PER_100G: NutritionValues = {
  energyKcal: 200,
  fatG: 10,
  saturatesG: 4,
  carbohydrateG: 20,
  sugarsG: 8,
  proteinG: 30,
  saltG: 1,
};

const GRAMS_CONTEXT: MeasureContext = {
  productName: "Test yoghurt",
  densityGMl: null,
  servingUnit: null,
  servingGrams: null,
  nutritionBasisUnit: "g",
};

// A per-unit product: nutrition is stated per 1 tbsp, not per 100 g.
const PER_TBSP_CONTEXT: MeasureContext = {
  productName: "Test spread",
  densityGMl: null,
  servingUnit: null,
  servingGrams: null,
  nutritionBasisUnit: "tbsp",
};

describe("previewContribution — grams basis", () => {
  it("scales per-100g values to the typed gram amount", () => {
    const preview = previewContribution({
      count: "150",
      unit: "g",
      context: GRAMS_CONTEXT,
      nutritionPerBasis: PER_100G,
      basisQuantity: 100,
    });

    expect(preview.kind).toBe("ready");
    if (preview.kind !== "ready") return;
    expect(preview.contribution.energyKcal).toBeCloseTo(300);
    expect(preview.contribution.proteinG).toBeCloseTo(45);
    expect(preview.contribution.saltG).toBeCloseTo(1.5);
  });

  it("accepts a decimal count", () => {
    const preview = previewContribution({
      count: "12.5",
      unit: "g",
      context: GRAMS_CONTEXT,
      nutritionPerBasis: PER_100G,
      basisQuantity: 100,
    });

    expect(preview.kind).toBe("ready");
    if (preview.kind !== "ready") return;
    expect(preview.contribution.energyKcal).toBeCloseTo(25);
  });
});

describe("previewContribution — per-unit basis", () => {
  it("uses the typed count directly when the unit is the product's own basis", () => {
    const preview = previewContribution({
      count: "2",
      unit: "tbsp",
      context: PER_TBSP_CONTEXT,
      nutritionPerBasis: PER_100G,
      basisQuantity: 1,
    });

    expect(preview.kind).toBe("ready");
    if (preview.kind !== "ready") return;
    expect(preview.contribution.energyKcal).toBeCloseTo(400);
  });
});

// Every one of these must stay silent rather than render a figure the app
// cannot stand behind - a wrong preview is a number the user will trust.
describe("previewContribution — nothing to show", () => {
  it("is unavailable for an empty count", () => {
    expect(
      previewContribution({
        count: "",
        unit: "g",
        context: GRAMS_CONTEXT,
        nutritionPerBasis: PER_100G,
        basisQuantity: 100,
      }).kind,
    ).toBe("unavailable");
  });

  it("is unavailable for a whitespace-only count", () => {
    expect(
      previewContribution({
        count: "   ",
        unit: "g",
        context: GRAMS_CONTEXT,
        nutritionPerBasis: PER_100G,
        basisQuantity: 100,
      }).kind,
    ).toBe("unavailable");
  });

  it("is unavailable for a zero count", () => {
    expect(
      previewContribution({
        count: "0",
        unit: "g",
        context: GRAMS_CONTEXT,
        nutritionPerBasis: PER_100G,
        basisQuantity: 100,
      }).kind,
    ).toBe("unavailable");
  });

  it("is unavailable for a negative count", () => {
    expect(
      previewContribution({
        count: "-50",
        unit: "g",
        context: GRAMS_CONTEXT,
        nutritionPerBasis: PER_100G,
        basisQuantity: 100,
      }).kind,
    ).toBe("unavailable");
  });

  it("is unavailable for a non-numeric count", () => {
    expect(
      previewContribution({
        count: "abc",
        unit: "g",
        context: GRAMS_CONTEXT,
        nutritionPerBasis: PER_100G,
        basisQuantity: 100,
      }).kind,
    ).toBe("unavailable");
  });

  // "tbsp" against a per-100g product with no density has no conversion -
  // resolveQuantity reports unresolved and the preview must follow it.
  it("is unavailable when the unit cannot be converted", () => {
    expect(
      previewContribution({
        count: "2",
        unit: "tbsp",
        context: GRAMS_CONTEXT,
        nutritionPerBasis: PER_100G,
        basisQuantity: 100,
      }).kind,
    ).toBe("unavailable");
  });

  it("is unavailable when the basis quantity is zero", () => {
    expect(
      previewContribution({
        count: "150",
        unit: "g",
        context: GRAMS_CONTEXT,
        nutritionPerBasis: PER_100G,
        basisQuantity: 0,
      }).kind,
    ).toBe("unavailable");
  });
});
