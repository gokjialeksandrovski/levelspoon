import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/features/meals/actions/meals", () => ({ updateMealIngredientQuantity: vi.fn() }));

import { updateMealIngredientQuantity } from "@/features/meals/actions/meals";

import type { MealIngredientDetail } from "@/features/meals/actions/meals";

import { editSeed, resolveAndSaveQuantity } from "./ingredient-row";

afterEach(() => {
  vi.clearAllMocks();
});

const GRAMS_CONTEXT = { productName: "Test", densityGMl: null, servingUnit: null, servingGrams: null, nutritionBasisUnit: "g", portions: [] };

describe("resolveAndSaveQuantity", () => {
  it("resolves a mass unit and saves the computed grams", async () => {
    vi.mocked(updateMealIngredientQuantity).mockResolvedValue(undefined);
    const onSaved = vi.fn();
    const callbacks = { router: { refresh: vi.fn() } as never, onBusyChange: vi.fn(), onError: vi.fn() };

    await resolveAndSaveQuantity(
      { ingredientId: "ingredient-1", count: "150", unit: "g", context: GRAMS_CONTEXT },
      onSaved, callbacks,
    );

    expect(updateMealIngredientQuantity).toHaveBeenCalledWith("ingredient-1", 150, "g", 150, "g");
    expect(onSaved).toHaveBeenCalledTimes(1);
  });

  it("saves a per-unit-basis product's count directly, in its own unit", async () => {
    vi.mocked(updateMealIngredientQuantity).mockResolvedValue(undefined);
    const onSaved = vi.fn();
    const callbacks = { router: { refresh: vi.fn() } as never, onBusyChange: vi.fn(), onError: vi.fn() };
    const context = { ...GRAMS_CONTEXT, servingUnit: "tbsp", nutritionBasisUnit: "tbsp" };

    await resolveAndSaveQuantity(
      { ingredientId: "ingredient-1", count: "2", unit: "tbsp", context },
      onSaved, callbacks,
    );

    expect(updateMealIngredientQuantity).toHaveBeenCalledWith("ingredient-1", 2, "tbsp", 2, "tbsp");
  });

  it("sets an error and never saves when the unit cannot be resolved", async () => {
    const onSaved = vi.fn();
    const callbacks = { router: { refresh: vi.fn() } as never, onBusyChange: vi.fn(), onError: vi.fn() };

    await resolveAndSaveQuantity(
      { ingredientId: "ingredient-1", count: "2", unit: "gummies", context: GRAMS_CONTEXT },
      onSaved, callbacks,
    );

    expect(updateMealIngredientQuantity).not.toHaveBeenCalled();
    expect(callbacks.onError).toHaveBeenCalledWith('Couldn\'t work out the amount in "gummies". Try a different unit.');
  });
});

describe("editSeed", () => {
  const ingredient = {
    quantity: 28,
    quantityUnit: "g",
    entryCount: 1,
    entryUnit: "slice",
  } as MealIngredientDetail;

  it("opens on the words the amount was entered in", () => {
    expect(editSeed(ingredient, ["slice", "g"])).toEqual({ count: "1", unit: "slice" });
  });

  it("falls back to the stored quantity when the entry unit no longer resolves", () => {
    expect(editSeed(ingredient, ["g"])).toEqual({ count: "28", unit: "g" });
  });

  it("falls back for a row written before the entry columns existed", () => {
    const old = { ...ingredient, entryCount: null, entryUnit: null } as MealIngredientDetail;
    expect(editSeed(old, ["slice", "g"])).toEqual({ count: "28", unit: "g" });
  });
});
