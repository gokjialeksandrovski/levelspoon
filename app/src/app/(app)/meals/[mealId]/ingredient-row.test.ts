import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/features/meals/actions/meals", () => ({ updateMealIngredientQuantity: vi.fn() }));

import { updateMealIngredientQuantity } from "@/features/meals/actions/meals";

import { resolveAndSaveQuantity } from "./ingredient-row";

afterEach(() => {
  vi.clearAllMocks();
});

const GRAMS_CONTEXT = { productName: "Test", densityGMl: null, servingUnit: null, servingGrams: null, nutritionBasisUnit: "g" };

describe("resolveAndSaveQuantity", () => {
  it("resolves a mass unit and saves the computed grams", async () => {
    vi.mocked(updateMealIngredientQuantity).mockResolvedValue(undefined);
    const onSaved = vi.fn();
    const callbacks = { router: { refresh: vi.fn() } as never, onBusyChange: vi.fn(), onError: vi.fn() };

    await resolveAndSaveQuantity(
      { ingredientId: "ingredient-1", count: "150", unit: "g", context: GRAMS_CONTEXT },
      onSaved, callbacks,
    );

    expect(updateMealIngredientQuantity).toHaveBeenCalledWith("ingredient-1", 150, "g");
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

    expect(updateMealIngredientQuantity).toHaveBeenCalledWith("ingredient-1", 2, "tbsp");
  });

  it("sets an error and never saves when the unit cannot be resolved", async () => {
    const onSaved = vi.fn();
    const callbacks = { router: { refresh: vi.fn() } as never, onBusyChange: vi.fn(), onError: vi.fn() };

    await resolveAndSaveQuantity(
      { ingredientId: "ingredient-1", count: "2", unit: "gummies", context: GRAMS_CONTEXT },
      onSaved, callbacks,
    );

    expect(updateMealIngredientQuantity).not.toHaveBeenCalled();
    expect(callbacks.onError).toHaveBeenCalledWith('Could not work out the amount in "gummies" - try a different unit.');
  });
});
