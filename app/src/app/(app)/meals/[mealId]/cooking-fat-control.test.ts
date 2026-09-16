import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/features/meals/actions/meals", () => ({ saveMealIngredient: vi.fn() }));
vi.mock("@/features/products/actions/products", () => ({ searchStandardFoods: vi.fn() }));
vi.mock("@/lib/haptics/log-success", () => ({ triggerLogSuccessHaptic: vi.fn() }));

import { saveMealIngredient } from "@/features/meals/actions/meals";
import { triggerLogSuccessHaptic } from "@/lib/haptics/log-success";

import { initialCookingUnit, resolveAndSaveCookingFat, saveCookingFat } from "./cooking-fat-control";

afterEach(() => {
  vi.clearAllMocks();
});

const baseInput = { mealId: "meal-1", productId: "oil-1", quantity: 13.8, quantityUnit: "g" };

describe("saveCookingFat", () => {
  it("fires the haptic and always saves as manual quantity source", async () => {
    vi.mocked(saveMealIngredient).mockResolvedValue({ mealIngredientId: "ingredient-1" });
    const onSaved = vi.fn();
    const callbacks = { setError: vi.fn(), setIsBusy: vi.fn() };

    await saveCookingFat(baseInput, onSaved, callbacks);

    expect(saveMealIngredient).toHaveBeenCalledWith({
      mealId: "meal-1", productId: "oil-1", quantity: 13.8, quantityUnit: "g", quantitySource: "manual",
    });
    expect(triggerLogSuccessHaptic).toHaveBeenCalledTimes(1);
    expect(onSaved).toHaveBeenCalledTimes(1);
  });

  it("does not fire the haptic when the save fails", async () => {
    vi.mocked(saveMealIngredient).mockRejectedValue(new Error("db down"));
    const onSaved = vi.fn();
    const callbacks = { setError: vi.fn(), setIsBusy: vi.fn() };

    await saveCookingFat(baseInput, onSaved, callbacks);

    expect(triggerLogSuccessHaptic).not.toHaveBeenCalled();
    expect(callbacks.setError).toHaveBeenCalledWith("Couldn't add this to the meal. Try again.");
  });
});

const OIL_CONTEXT = { productName: "Olive oil", densityGMl: 0.92, servingUnit: null, servingGrams: null, nutritionBasisUnit: "g" };

describe("resolveAndSaveCookingFat", () => {
  it("resolves a volume unit through density and saves the computed grams", async () => {
    vi.mocked(saveMealIngredient).mockResolvedValue({ mealIngredientId: "ingredient-1" });
    const onSaved = vi.fn();
    const callbacks = { setError: vi.fn(), setIsBusy: vi.fn() };

    await resolveAndSaveCookingFat(
      { mealId: "meal-1", productId: "oil-1", count: "1", unit: "tbsp", context: OIL_CONTEXT },
      onSaved, callbacks,
    );

    expect(saveMealIngredient).toHaveBeenCalledWith({
      mealId: "meal-1", productId: "oil-1", quantity: 13.8, quantityUnit: "g", quantitySource: "manual",
    });
  });

  it("sets an error and never saves when the unit cannot be resolved", async () => {
    const onSaved = vi.fn();
    const callbacks = { setError: vi.fn(), setIsBusy: vi.fn() };

    await resolveAndSaveCookingFat(
      { mealId: "meal-1", productId: "oil-1", count: "2", unit: "gummies", context: OIL_CONTEXT },
      onSaved, callbacks,
    );

    expect(saveMealIngredient).not.toHaveBeenCalled();
    expect(callbacks.setError).toHaveBeenCalledWith('Couldn\'t work out the amount in "gummies". Try a different unit.');
  });
});

describe("initialCookingUnit", () => {
  it("defaults to tbsp when the product's density resolves a volume unit", () => {
    expect(initialCookingUnit(OIL_CONTEXT)).toBe("tbsp");
  });

  it("falls back to the product's serving unit when nothing is measured by volume", () => {
    const context = { productName: "Egg", densityGMl: null, servingUnit: "large", servingGrams: 50, nutritionBasisUnit: "g" };
    expect(initialCookingUnit(context)).toBe("large");
  });

  it("falls back to grams when nothing is learned at all", () => {
    const context = { productName: "Salt", densityGMl: null, servingUnit: null, servingGrams: null, nutritionBasisUnit: "g" };
    expect(initialCookingUnit(context)).toBe("g");
  });
});
