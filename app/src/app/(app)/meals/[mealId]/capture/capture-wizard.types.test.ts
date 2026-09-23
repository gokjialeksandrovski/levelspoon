import { describe, expect, it } from "vitest";

import { NOTHING_LEARNED } from "@/lib/measures/learn";

import { wizardReducer } from "./capture-wizard.types";

// Spread into both ProductCandidate inputs and the SelectedProduct outputs
// they map to, so it carries the union of what the two shapes need. Nutrition
// is opaque here - these tests assert routing, not arithmetic.
const NO_MEASURES = {
  brand: null,
  portions: [],
  densityGMl: null,
  servingUnit: null,
  servingGrams: null,
  nutritionBasisUnit: "g",
  nutritionBasisQuantity: 100,
  nutritionPerBasis: {} as never,
};

describe("wizardReducer", () => {
  it("routes a confident match straight to the amount step with alternatives carried over", () => {
    const next = wizardReducer(
      { kind: "product-photo", pendingBarcode: null },
      {
        type: "MATCH_RESOLVED",
        nameGuess: "Olympus Greek Yogurt 2 Fat",
        result: {
          kind: "confident",
          product: { id: "p1", name: "Olympus Greek Yogurt 2% Fat", nutritionPer100g: {} as never, nutritionPhotoKey: null, ...NO_MEASURES },
          alternatives: [{ id: "p2", name: "Olympus Greek Yogurt 10% Fat", nutritionPer100g: {} as never, nutritionPhotoKey: null, ...NO_MEASURES }],
        },
        netWeightText: null,
        pendingBarcode: null,
      },
    );

    expect(next).toEqual({
      kind: "amount",
      product: { id: "p1", name: "Olympus Greek Yogurt 2% Fat", ...NO_MEASURES },
      alternatives: [{ id: "p2", name: "Olympus Greek Yogurt 10% Fat", ...NO_MEASURES }],
      pendingBarcode: null,
    });
  });

  it("carries a pending barcode from a not_found scan into the amount step on a confident match", () => {
    const next = wizardReducer(
      { kind: "product-photo", pendingBarcode: "0000000000000" },
      {
        type: "MATCH_RESOLVED",
        nameGuess: "Olympus Greek Yogurt 2% Fat",
        result: {
          kind: "confident",
          product: { id: "p1", name: "Olympus Greek Yogurt 2% Fat", nutritionPer100g: {} as never, nutritionPhotoKey: null, ...NO_MEASURES },
          alternatives: [],
        },
        netWeightText: null,
        pendingBarcode: "0000000000000",
      },
    );

    expect(next).toEqual({
      kind: "amount",
      product: { id: "p1", name: "Olympus Greek Yogurt 2% Fat", ...NO_MEASURES },
      alternatives: [],
      pendingBarcode: "0000000000000",
    });
  });

  it("routes an ambiguous match to the match-result step, carrying the net weight forward", () => {
    const next = wizardReducer(
      { kind: "product-photo", pendingBarcode: null },
      {
        type: "MATCH_RESOLVED",
        nameGuess: "Olympus Greek Yogurt Fat",
        result: { kind: "ambiguous", candidates: [{ id: "p1", name: "A", nutritionPer100g: {} as never, nutritionPhotoKey: null, ...NO_MEASURES }] },
        netWeightText: "NET WT 1.86 0Z (52.7g)",
        pendingBarcode: null,
      },
    );

    expect(next).toEqual({
      kind: "match-result",
      nameGuess: "Olympus Greek Yogurt Fat",
      candidates: [{ id: "p1", name: "A", ...NO_MEASURES }],
      netWeightText: "NET WT 1.86 0Z (52.7g)",
      pendingBarcode: null,
    });
  });

  it("carries a pending barcode from a not_found scan into the match-result step on an ambiguous match", () => {
    const next = wizardReducer(
      { kind: "product-photo", pendingBarcode: "0000000000000" },
      {
        type: "MATCH_RESOLVED",
        nameGuess: "Olympus Greek Yogurt Fat",
        result: { kind: "ambiguous", candidates: [{ id: "p1", name: "A", nutritionPer100g: {} as never, nutritionPhotoKey: null, ...NO_MEASURES }] },
        netWeightText: null,
        pendingBarcode: "0000000000000",
      },
    );

    expect(next).toEqual({
      kind: "match-result",
      nameGuess: "Olympus Greek Yogurt Fat",
      candidates: [{ id: "p1", name: "A", ...NO_MEASURES }],
      netWeightText: null,
      pendingBarcode: "0000000000000",
    });
  });

  it("routes a no_match straight to the nutrition-photo step, carrying the net weight and a pending barcode", () => {
    const next = wizardReducer(
      { kind: "product-photo", pendingBarcode: "0000000000000" },
      {
        type: "MATCH_RESOLVED",
        nameGuess: "Unknown Product",
        result: { kind: "no_match" },
        netWeightText: "NET WT 1.86 0Z (52.7g)",
        pendingBarcode: "0000000000000",
      },
    );

    expect(next).toEqual({
      kind: "nutrition-photo",
      nameGuess: "Unknown Product",
      netWeightText: "NET WT 1.86 0Z (52.7g)",
      pendingBarcode: "0000000000000",
    });
  });

  it("returns to product-photo on ADD_ANOTHER", () => {
    const next = wizardReducer({ kind: "saved" }, { type: "ADD_ANOTHER" });
    expect(next).toEqual({ kind: "product-photo", pendingBarcode: null });
  });

  it("routes CANDIDATE_CHOSEN from match-result to the amount step, carrying a pending barcode forward", () => {
    const next = wizardReducer(
      {
        kind: "match-result",
        nameGuess: "Olympus Greek Yogurt Fat",
        candidates: [{ id: "p1", name: "A", ...NO_MEASURES }],
        netWeightText: null,
        pendingBarcode: "1111111111116",
      },
      {
        type: "CANDIDATE_CHOSEN",
        product: { id: "p1", name: "Olympus Greek Yogurt 2% Fat", ...NO_MEASURES },
        alternatives: [{ id: "p2", name: "Olympus Greek Yogurt 10% Fat", ...NO_MEASURES }],
        pendingBarcode: "1111111111116",
      },
    );

    expect(next).toEqual({
      kind: "amount",
      product: { id: "p1", name: "Olympus Greek Yogurt 2% Fat", ...NO_MEASURES },
      alternatives: [{ id: "p2", name: "Olympus Greek Yogurt 10% Fat", ...NO_MEASURES }],
      pendingBarcode: "1111111111116",
    });
  });

  it("routes NONE_OF_THESE to the nutrition-photo step, carrying the net weight and a pending barcode forward", () => {
    const next = wizardReducer(
      {
        kind: "match-result",
        nameGuess: "Olympus Greek Yogurt Fat",
        candidates: [],
        netWeightText: "NET WT 1.86 0Z (52.7g)",
        pendingBarcode: "0000000000000",
      },
      {
        type: "NONE_OF_THESE",
        nameGuess: "Olympus Greek Yogurt Fat",
        netWeightText: "NET WT 1.86 0Z (52.7g)",
        pendingBarcode: "0000000000000",
      },
    );

    expect(next).toEqual({
      kind: "nutrition-photo",
      nameGuess: "Olympus Greek Yogurt Fat",
      netWeightText: "NET WT 1.86 0Z (52.7g)",
      pendingBarcode: "0000000000000",
    });
  });

  it("routes NUTRITION_PARSED to the confirm step carrying the parsed values, flags, name, and photo", () => {
    const parsed = {
      energyKcal: null,
      fatG: null,
      saturatesG: null,
      carbohydrateG: null,
      sugarsG: null,
      proteinG: null,
      saltG: null,
      fibreG: null,
    };
    const flags = ["energy_kcal", "fat_g", "saturates_g", "carbohydrate_g", "sugars_g", "protein_g", "salt_g"];
    const photo = new Blob(["fake-photo-bytes"]);

    const next = wizardReducer(
      { kind: "nutrition-photo", nameGuess: "Unknown Product", netWeightText: null, pendingBarcode: null },
      { type: "NUTRITION_PARSED", parsed, flags, name: "Unknown Product", photo, learned: NOTHING_LEARNED, nutritionBasisUnit: "g", nutritionBasisQuantity: 100, pendingBarcode: null },
    );

    expect(next).toEqual({
      kind: "confirm",
      parsed,
      flags,
      name: "Unknown Product",
      photo,
      learned: NOTHING_LEARNED,
      nutritionBasisUnit: "g",
      nutritionBasisQuantity: 100,
      pendingBarcode: null,
      barcode: null,
      nutritionOrigin: null,
      duplicates: [],
    });
  });

  it("routes PRODUCT_CREATED to the amount step with no alternatives", () => {
    const next = wizardReducer(
      {
        kind: "confirm",
        parsed: {} as never,
        flags: [],
        name: "Unknown Product",
        photo: new Blob(),
        learned: NOTHING_LEARNED,
        nutritionBasisUnit: "g",
        nutritionBasisQuantity: 100,
        pendingBarcode: null,
        barcode: null,
        nutritionOrigin: null,
        duplicates: [],
      },
      { type: "PRODUCT_CREATED", product: { id: "p3", name: "Unknown Product", ...NO_MEASURES } },
    );

    expect(next).toEqual({
      kind: "amount",
      product: { id: "p3", name: "Unknown Product", ...NO_MEASURES },
      alternatives: [],
      pendingBarcode: null,
    });
  });

  it("routes SAVED to the saved step from any state", () => {
    const next = wizardReducer(
      { kind: "amount", product: { id: "p1", name: "A", ...NO_MEASURES }, alternatives: [], pendingBarcode: null },
      { type: "SAVED" },
    );

    expect(next).toEqual({ kind: "saved" });
  });

  it("routes CHANGE_MATCH back to the match-result step, with no net weight available to carry, but a pending barcode preserved", () => {
    // Unlike MATCH_RESOLVED/NONE_OF_THESE, this path starts from the amount
    // step - which never had a front-panel net weight to begin with (a
    // SelectedProduct only ever carries id/name/its learned measures) - so
    // there is nothing to thread forward. A pending barcode, added to the
    // amount step by this same ticket, does carry forward: switching match
    // here must not silently drop the still-unlinked scanned code (T4).
    const next = wizardReducer(
      { kind: "amount", product: { id: "p1", name: "Olympus Greek Yogurt 2% Fat", ...NO_MEASURES }, alternatives: [], pendingBarcode: "0000000000000" },
      {
        type: "CHANGE_MATCH",
        nameGuess: "Olympus Greek Yogurt 2% Fat",
        candidates: [
          { id: "p1", name: "Olympus Greek Yogurt 2% Fat", ...NO_MEASURES },
          { id: "p2", name: "Olympus Greek Yogurt 10% Fat", ...NO_MEASURES },
        ],
        pendingBarcode: "0000000000000",
      },
    );

    expect(next).toEqual({
      kind: "match-result",
      nameGuess: "Olympus Greek Yogurt 2% Fat",
      candidates: [
        { id: "p1", name: "Olympus Greek Yogurt 2% Fat", ...NO_MEASURES },
        { id: "p2", name: "Olympus Greek Yogurt 10% Fat", ...NO_MEASURES },
      ],
      netWeightText: null,
      pendingBarcode: "0000000000000",
    });
  });
});

describe("wizardReducer — whole food search", () => {
  it("routes WHOLE_FOOD_SEARCH from product-photo to the standard-food-search step", () => {
    const next = wizardReducer({ kind: "product-photo", pendingBarcode: null }, { type: "WHOLE_FOOD_SEARCH" });
    expect(next).toEqual({ kind: "standard-food-search" });
  });

  it("routes WHOLE_FOOD_CHOSEN to the amount step with no alternatives", () => {
    const next = wizardReducer(
      { kind: "standard-food-search" },
      { type: "WHOLE_FOOD_CHOSEN", product: { id: "s1", name: "Banana", ...NO_MEASURES } },
    );

    expect(next).toEqual({
      kind: "amount",
      product: { id: "s1", name: "Banana", ...NO_MEASURES },
      alternatives: [],
      pendingBarcode: null,
    });
  });
});

const PER_SERVING = {
  energyKcal: 250, fatG: 12, saturatesG: 4.5, carbohydrateG: 32,
  sugarsG: 28, proteinG: 4, saltG: 0.3125, fibreG: null,
};

const LEARNED_BAR = { densityGMl: null, servingUnit: "bas", servingGrams: 52 };

describe("wizardReducer — serving size", () => {
  it("routes SERVING_SIZE_NEEDED to the serving-size step carrying the label's own text and a pending barcode", () => {
    const photo = new Blob(["photo"]);
    const next = wizardReducer(
      { kind: "nutrition-photo", nameGuess: "Snickers", netWeightText: "NET WT 1.86 0Z (52.7g)", pendingBarcode: "1111111111116" },
      {
        type: "SERVING_SIZE_NEEDED",
        servingSizeText: "1 bas",
        perServing: PER_SERVING,
        name: "Snickers",
        photo,
        prefillGrams: 1.098,
        unitName: "bas",
        pendingBarcode: "1111111111116",
      },
    );

    expect(next).toEqual({
      kind: "serving-size",
      servingSizeText: "1 bas",
      perServing: PER_SERVING,
      name: "Snickers",
      photo,
      prefillGrams: 1.098,
      unitName: "bas",
      pendingBarcode: "1111111111116",
    });
  });

  it("routes NUTRITION_PARSED from the serving-size step to confirm, carrying what was learned and the pending barcode", () => {
    const photo = new Blob(["photo"]);
    const parsed = { ...PER_SERVING };
    const next = wizardReducer(
      {
        kind: "serving-size",
        servingSizeText: "1 bas",
        perServing: PER_SERVING,
        name: "Snickers",
        photo,
        prefillGrams: null,
        unitName: "bas",
        pendingBarcode: "1111111111116",
      },
      { type: "NUTRITION_PARSED", parsed, flags: [], name: "Snickers", photo, learned: LEARNED_BAR, nutritionBasisUnit: "g", nutritionBasisQuantity: 100, pendingBarcode: "1111111111116" },
    );

    expect(next).toEqual({
      kind: "confirm",
      parsed,
      flags: [],
      name: "Snickers",
      photo,
      learned: LEARNED_BAR,
      nutritionBasisUnit: "g",
      nutritionBasisQuantity: 100,
      pendingBarcode: "1111111111116",
      barcode: null,
      nutritionOrigin: null,
      duplicates: [],
    });
  });
});

const MOCK_NUTRITION = {
  energyKcal: 250, fatG: 10, saturatesG: 3, carbohydrateG: 30, sugarsG: 12, proteinG: 6, saltG: 0.5, fibreG: null,
};

describe("wizardReducer — barcode scan", () => {
  it("routes an internal_match straight to the amount step with no alternatives", () => {
    const next = wizardReducer(
      { kind: "product-photo", pendingBarcode: null },
      {
        type: "BARCODE_SCANNED",
        result: {
          kind: "internal_match",
          product: { id: "p1", name: "Olympus Greek Yogurt 2% Fat", nutritionPer100g: {} as never, nutritionPhotoKey: null, ...NO_MEASURES },
        },
      },
    );

    expect(next).toEqual({
      kind: "amount",
      product: { id: "p1", name: "Olympus Greek Yogurt 2% Fat", ...NO_MEASURES },
      alternatives: [],
      pendingBarcode: null,
    });
  });

  it("routes an external_match to a prefilled, photo-less confirm step with the barcode carried for attach-on-save", () => {
    const next = wizardReducer(
      { kind: "product-photo", pendingBarcode: null },
      {
        type: "BARCODE_SCANNED",
        result: {
          kind: "external_match",
          barcode: "4006381333931",
          nameGuess: "Mock Product",
          nutritionPer100g: MOCK_NUTRITION,
          nutritionBasisUnit: "g",
          netWeightText: "250 g",
          flags: [],
          duplicates: [],
        },
      },
    );

    expect(next).toEqual({
      kind: "confirm",
      parsed: MOCK_NUTRITION,
      flags: [],
      name: "Mock Product",
      photo: undefined,
      learned: NOTHING_LEARNED,
      nutritionBasisUnit: "g",
      nutritionBasisQuantity: 100,
      pendingBarcode: null,
      barcode: "4006381333931",
      nutritionOrigin: "open_food_facts",
      duplicates: [],
    });
  });

  it("routes a not_found result back to product-photo, carrying the scanned code as pendingBarcode", () => {
    const next = wizardReducer(
      { kind: "product-photo", pendingBarcode: null },
      { type: "BARCODE_SCANNED", result: { kind: "not_found", barcode: "0000000000000" } },
    );

    expect(next).toEqual({ kind: "product-photo", pendingBarcode: "0000000000000" });
  });
});
