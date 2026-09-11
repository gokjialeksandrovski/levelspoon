import { describe, expect, it } from "vitest";

import { NOTHING_LEARNED } from "@/lib/measures/learn";

import { wizardReducer } from "./capture-wizard.types";

const NO_MEASURES = { densityGMl: null, servingUnit: null, servingGrams: null };

describe("wizardReducer", () => {
  it("routes a confident match straight to the amount step with alternatives carried over", () => {
    const next = wizardReducer(
      { kind: "product-photo" },
      {
        type: "MATCH_RESOLVED",
        nameGuess: "Olympus Greek Yogurt 2 Fat",
        result: {
          kind: "confident",
          product: { id: "p1", name: "Olympus Greek Yogurt 2% Fat", brand: null, nutritionPer100g: {} as never, nutritionPhotoKey: "", ...NO_MEASURES },
          alternatives: [{ id: "p2", name: "Olympus Greek Yogurt 10% Fat", brand: null, nutritionPer100g: {} as never, nutritionPhotoKey: "", ...NO_MEASURES }],
        },
        netWeightText: null,
      },
    );

    expect(next).toEqual({
      kind: "amount",
      product: { id: "p1", name: "Olympus Greek Yogurt 2% Fat", ...NO_MEASURES },
      alternatives: [{ id: "p2", name: "Olympus Greek Yogurt 10% Fat", ...NO_MEASURES }],
    });
  });

  it("routes an ambiguous match to the match-result step, carrying the net weight forward", () => {
    const next = wizardReducer(
      { kind: "product-photo" },
      {
        type: "MATCH_RESOLVED",
        nameGuess: "Olympus Greek Yogurt Fat",
        result: { kind: "ambiguous", candidates: [{ id: "p1", name: "A", brand: null, nutritionPer100g: {} as never, nutritionPhotoKey: "", ...NO_MEASURES }] },
        netWeightText: "NET WT 1.86 0Z (52.7g)",
      },
    );

    expect(next).toEqual({
      kind: "match-result",
      nameGuess: "Olympus Greek Yogurt Fat",
      candidates: [{ id: "p1", name: "A", ...NO_MEASURES }],
      netWeightText: "NET WT 1.86 0Z (52.7g)",
    });
  });

  it("routes a no_match straight to the nutrition-photo step, carrying the net weight", () => {
    const next = wizardReducer(
      { kind: "product-photo" },
      {
        type: "MATCH_RESOLVED",
        nameGuess: "Unknown Product",
        result: { kind: "no_match" },
        netWeightText: "NET WT 1.86 0Z (52.7g)",
      },
    );

    expect(next).toEqual({
      kind: "nutrition-photo",
      nameGuess: "Unknown Product",
      netWeightText: "NET WT 1.86 0Z (52.7g)",
    });
  });

  it("returns to product-photo on ADD_ANOTHER", () => {
    const next = wizardReducer({ kind: "saved" }, { type: "ADD_ANOTHER" });
    expect(next).toEqual({ kind: "product-photo" });
  });

  it("routes CANDIDATE_CHOSEN from match-result to the amount step", () => {
    const next = wizardReducer(
      {
        kind: "match-result",
        nameGuess: "Olympus Greek Yogurt Fat",
        candidates: [{ id: "p1", name: "A", ...NO_MEASURES }],
        netWeightText: null,
      },
      {
        type: "CANDIDATE_CHOSEN",
        product: { id: "p1", name: "Olympus Greek Yogurt 2% Fat", ...NO_MEASURES },
        alternatives: [{ id: "p2", name: "Olympus Greek Yogurt 10% Fat", ...NO_MEASURES }],
      },
    );

    expect(next).toEqual({
      kind: "amount",
      product: { id: "p1", name: "Olympus Greek Yogurt 2% Fat", ...NO_MEASURES },
      alternatives: [{ id: "p2", name: "Olympus Greek Yogurt 10% Fat", ...NO_MEASURES }],
    });
  });

  it("routes NONE_OF_THESE to the nutrition-photo step, carrying the net weight forward", () => {
    const next = wizardReducer(
      {
        kind: "match-result",
        nameGuess: "Olympus Greek Yogurt Fat",
        candidates: [],
        netWeightText: "NET WT 1.86 0Z (52.7g)",
      },
      {
        type: "NONE_OF_THESE",
        nameGuess: "Olympus Greek Yogurt Fat",
        netWeightText: "NET WT 1.86 0Z (52.7g)",
      },
    );

    expect(next).toEqual({
      kind: "nutrition-photo",
      nameGuess: "Olympus Greek Yogurt Fat",
      netWeightText: "NET WT 1.86 0Z (52.7g)",
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
    };
    const flags = ["energy_kcal", "fat_g", "saturates_g", "carbohydrate_g", "sugars_g", "protein_g", "salt_g"];
    const photo = new Blob(["fake-photo-bytes"]);

    const next = wizardReducer(
      { kind: "nutrition-photo", nameGuess: "Unknown Product", netWeightText: null },
      { type: "NUTRITION_PARSED", parsed, flags, name: "Unknown Product", photo, learned: NOTHING_LEARNED },
    );

    expect(next).toEqual({
      kind: "confirm",
      parsed,
      flags,
      name: "Unknown Product",
      photo,
      learned: NOTHING_LEARNED,
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
      },
      { type: "PRODUCT_CREATED", product: { id: "p3", name: "Unknown Product", ...NO_MEASURES } },
    );

    expect(next).toEqual({
      kind: "amount",
      product: { id: "p3", name: "Unknown Product", ...NO_MEASURES },
      alternatives: [],
    });
  });

  it("routes SAVED to the saved step from any state", () => {
    const next = wizardReducer(
      { kind: "amount", product: { id: "p1", name: "A", ...NO_MEASURES }, alternatives: [] },
      { type: "SAVED" },
    );

    expect(next).toEqual({ kind: "saved" });
  });

  it("routes CHANGE_MATCH back to the match-result step, with no net weight available to carry", () => {
    // Unlike MATCH_RESOLVED/NONE_OF_THESE, this path starts from the amount
    // step - which never had a front-panel net weight to begin with (a
    // SelectedProduct only ever carries id/name/its learned measures) - so
    // there is nothing to thread forward.
    const next = wizardReducer(
      { kind: "amount", product: { id: "p1", name: "Olympus Greek Yogurt 2% Fat", ...NO_MEASURES }, alternatives: [] },
      {
        type: "CHANGE_MATCH",
        nameGuess: "Olympus Greek Yogurt 2% Fat",
        candidates: [
          { id: "p1", name: "Olympus Greek Yogurt 2% Fat", ...NO_MEASURES },
          { id: "p2", name: "Olympus Greek Yogurt 10% Fat", ...NO_MEASURES },
        ],
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
    });
  });
});

describe("wizardReducer — whole food search", () => {
  it("routes WHOLE_FOOD_SEARCH from product-photo to the standard-food-search step", () => {
    const next = wizardReducer({ kind: "product-photo" }, { type: "WHOLE_FOOD_SEARCH" });
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
    });
  });
});

const PER_SERVING = {
  energyKcal: 250, fatG: 12, saturatesG: 4.5, carbohydrateG: 32,
  sugarsG: 28, proteinG: 4, saltG: 0.3125,
};

const LEARNED_BAR = { densityGMl: null, servingUnit: "bas", servingGrams: 52 };

describe("wizardReducer — serving size", () => {
  it("routes SERVING_SIZE_NEEDED to the serving-size step carrying the label's own text", () => {
    const photo = new Blob(["photo"]);
    const next = wizardReducer(
      { kind: "nutrition-photo", nameGuess: "Snickers", netWeightText: "NET WT 1.86 0Z (52.7g)" },
      {
        type: "SERVING_SIZE_NEEDED",
        servingSizeText: "1 bas",
        perServing: PER_SERVING,
        name: "Snickers",
        photo,
        prefillGrams: 1.098,
      },
    );

    expect(next).toEqual({
      kind: "serving-size",
      servingSizeText: "1 bas",
      perServing: PER_SERVING,
      name: "Snickers",
      photo,
      prefillGrams: 1.098,
    });
  });

  it("routes NUTRITION_PARSED from the serving-size step to confirm, carrying what was learned", () => {
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
      },
      { type: "NUTRITION_PARSED", parsed, flags: [], name: "Snickers", photo, learned: LEARNED_BAR },
    );

    expect(next).toEqual({
      kind: "confirm",
      parsed,
      flags: [],
      name: "Snickers",
      photo,
      learned: LEARNED_BAR,
    });
  });
});
