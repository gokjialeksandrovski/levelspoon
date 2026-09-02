// app/src/app/meals/[mealId]/capture-wizard.types.test.ts
import { describe, expect, it } from "vitest";

import { NOTHING_LEARNED } from "@/lib/measures/learn";

import { wizardReducer } from "./capture-wizard.types";

describe("wizardReducer", () => {
  it("routes a confident match straight to the amount step with alternatives carried over", () => {
    const next = wizardReducer(
      { kind: "product-photo" },
      {
        type: "MATCH_RESOLVED",
        nameGuess: "Olympus Greek Yogurt 2 Fat",
        result: {
          kind: "confident",
          product: { id: "p1", name: "Olympus Greek Yogurt 2% Fat", brand: null, nutritionPer100g: {} as never, nutritionPhotoKey: "" },
          alternatives: [{ id: "p2", name: "Olympus Greek Yogurt 10% Fat", brand: null, nutritionPer100g: {} as never, nutritionPhotoKey: "" }],
        },
      },
    );

    expect(next).toEqual({
      kind: "amount",
      product: { id: "p1", name: "Olympus Greek Yogurt 2% Fat" },
      alternatives: [{ id: "p2", name: "Olympus Greek Yogurt 10% Fat" }],
    });
  });

  it("routes an ambiguous match to the match-result step", () => {
    const next = wizardReducer(
      { kind: "product-photo" },
      {
        type: "MATCH_RESOLVED",
        nameGuess: "Olympus Greek Yogurt Fat",
        result: { kind: "ambiguous", candidates: [{ id: "p1", name: "A", brand: null, nutritionPer100g: {} as never, nutritionPhotoKey: "" }] },
      },
    );

    expect(next.kind).toBe("match-result");
  });

  it("routes a no_match straight to the nutrition-photo step", () => {
    const next = wizardReducer(
      { kind: "product-photo" },
      { type: "MATCH_RESOLVED", nameGuess: "Unknown Product", result: { kind: "no_match" } },
    );

    expect(next).toEqual({ kind: "nutrition-photo", nameGuess: "Unknown Product" });
  });

  it("returns to product-photo on ADD_ANOTHER", () => {
    const next = wizardReducer({ kind: "saved" }, { type: "ADD_ANOTHER" });
    expect(next).toEqual({ kind: "product-photo" });
  });

  it("routes CANDIDATE_CHOSEN from match-result to the amount step", () => {
    const next = wizardReducer(
      { kind: "match-result", nameGuess: "Olympus Greek Yogurt Fat", candidates: [{ id: "p1", name: "A" }] },
      {
        type: "CANDIDATE_CHOSEN",
        product: { id: "p1", name: "Olympus Greek Yogurt 2% Fat" },
        alternatives: [{ id: "p2", name: "Olympus Greek Yogurt 10% Fat" }],
      },
    );

    expect(next).toEqual({
      kind: "amount",
      product: { id: "p1", name: "Olympus Greek Yogurt 2% Fat" },
      alternatives: [{ id: "p2", name: "Olympus Greek Yogurt 10% Fat" }],
    });
  });

  it("routes NONE_OF_THESE to the nutrition-photo step", () => {
    const next = wizardReducer(
      { kind: "match-result", nameGuess: "Olympus Greek Yogurt Fat", candidates: [] },
      { type: "NONE_OF_THESE", nameGuess: "Olympus Greek Yogurt Fat" },
    );

    expect(next).toEqual({ kind: "nutrition-photo", nameGuess: "Olympus Greek Yogurt Fat" });
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
      { kind: "nutrition-photo", nameGuess: "Unknown Product" },
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
      { type: "PRODUCT_CREATED", product: { id: "p3", name: "Unknown Product" } },
    );

    expect(next).toEqual({
      kind: "amount",
      product: { id: "p3", name: "Unknown Product" },
      alternatives: [],
    });
  });

  it("routes SAVED to the saved step from any state", () => {
    const next = wizardReducer(
      { kind: "amount", product: { id: "p1", name: "A" }, alternatives: [] },
      { type: "SAVED" },
    );

    expect(next).toEqual({ kind: "saved" });
  });

  it("routes CHANGE_MATCH back to the match-result step with the given candidates", () => {
    const next = wizardReducer(
      { kind: "amount", product: { id: "p1", name: "Olympus Greek Yogurt 2% Fat" }, alternatives: [] },
      {
        type: "CHANGE_MATCH",
        nameGuess: "Olympus Greek Yogurt 2% Fat",
        candidates: [{ id: "p1", name: "Olympus Greek Yogurt 2% Fat" }, { id: "p2", name: "Olympus Greek Yogurt 10% Fat" }],
      },
    );

    expect(next).toEqual({
      kind: "match-result",
      nameGuess: "Olympus Greek Yogurt 2% Fat",
      candidates: [{ id: "p1", name: "Olympus Greek Yogurt 2% Fat" }, { id: "p2", name: "Olympus Greek Yogurt 10% Fat" }],
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
      { kind: "nutrition-photo", nameGuess: "Snickers" },
      {
        type: "SERVING_SIZE_NEEDED",
        servingSizeText: "1 bas",
        perServing: PER_SERVING,
        name: "Snickers",
        photo,
      },
    );

    expect(next).toEqual({
      kind: "serving-size",
      servingSizeText: "1 bas",
      perServing: PER_SERVING,
      name: "Snickers",
      photo,
    });
  });

  it("routes NUTRITION_PARSED from the serving-size step to confirm, carrying what was learned", () => {
    const photo = new Blob(["photo"]);
    const parsed = { ...PER_SERVING };
    const next = wizardReducer(
      { kind: "serving-size", servingSizeText: "1 bas", perServing: PER_SERVING, name: "Snickers", photo },
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
