// app/src/app/meals/[mealId]/capture-wizard.types.test.ts
import { describe, expect, it } from "vitest";

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
});
