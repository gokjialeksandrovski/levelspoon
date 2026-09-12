import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/actions/meals", () => ({ saveMealIngredient: vi.fn() }));
vi.mock("@/lib/haptics/log-success", () => ({ triggerLogSuccessHaptic: vi.fn() }));

import { saveMealIngredient } from "@/actions/meals";
import { triggerLogSuccessHaptic } from "@/lib/haptics/log-success";

import { resolveAndSaveAmount, saveAmount } from "./amount-step";

afterEach(() => {
  vi.clearAllMocks();
});

const baseInput = { mealId: "meal-1", productId: "product-1", quantity: 150, quantityUnit: "g", source: "manual" as const };

describe("saveAmount", () => {
  it("fires the haptic on a successful save", async () => {
    vi.mocked(saveMealIngredient).mockResolvedValue({ mealIngredientId: "ingredient-1" });
    const dispatch = vi.fn();
    const onSaved = vi.fn();
    const callbacks = { setError: vi.fn(), setIsBusy: vi.fn() };

    await saveAmount(baseInput, dispatch, onSaved, callbacks);

    expect(triggerLogSuccessHaptic).toHaveBeenCalledTimes(1);
    expect(dispatch).toHaveBeenCalledWith({ type: "SAVED" });
    expect(onSaved).toHaveBeenCalledTimes(1);
  });

  it("does not fire the haptic when the save fails", async () => {
    vi.mocked(saveMealIngredient).mockRejectedValue(new Error("db down"));
    const dispatch = vi.fn();
    const onSaved = vi.fn();
    const callbacks = { setError: vi.fn(), setIsBusy: vi.fn() };

    await saveAmount(baseInput, dispatch, onSaved, callbacks);

    expect(triggerLogSuccessHaptic).not.toHaveBeenCalled();
    expect(callbacks.setError).toHaveBeenCalledWith("Could not save this ingredient. Please try again.");
  });
});

const EMPTY_CONTEXT = { productName: "Test", densityGMl: null, servingUnit: null, servingGrams: null, nutritionBasisUnit: "g" };

describe("resolveAndSaveAmount", () => {
  it("resolves a mass unit and saves the computed grams", async () => {
    vi.mocked(saveMealIngredient).mockResolvedValue({ mealIngredientId: "ingredient-1" });
    const dispatch = vi.fn();
    const onSaved = vi.fn();
    const callbacks = { setError: vi.fn(), setIsBusy: vi.fn() };

    await resolveAndSaveAmount(
      { mealId: "meal-1", productId: "product-1", count: "150", unit: "g", context: EMPTY_CONTEXT, source: "manual" },
      dispatch, onSaved, callbacks,
    );

    expect(saveMealIngredient).toHaveBeenCalledWith({
      mealId: "meal-1", productId: "product-1", quantity: 150, quantityUnit: "g", quantitySource: "manual",
    });
  });

  it("resolves a learned serving unit through to grams", async () => {
    vi.mocked(saveMealIngredient).mockResolvedValue({ mealIngredientId: "ingredient-1" });
    const dispatch = vi.fn();
    const onSaved = vi.fn();
    const callbacks = { setError: vi.fn(), setIsBusy: vi.fn() };
    const context = { ...EMPTY_CONTEXT, servingUnit: "bar", servingGrams: 52 };

    await resolveAndSaveAmount(
      { mealId: "meal-1", productId: "product-1", count: "2", unit: "bar", context, source: "manual" },
      dispatch, onSaved, callbacks,
    );

    expect(saveMealIngredient).toHaveBeenCalledWith({
      mealId: "meal-1", productId: "product-1", quantity: 104, quantityUnit: "g", quantitySource: "manual",
    });
  });

  it("saves a per-unit-basis product's count directly, in its own unit", async () => {
    vi.mocked(saveMealIngredient).mockResolvedValue({ mealIngredientId: "ingredient-1" });
    const dispatch = vi.fn();
    const onSaved = vi.fn();
    const callbacks = { setError: vi.fn(), setIsBusy: vi.fn() };
    // No density here - proves this doesn't go through resolveGrams (it
    // would fail to convert "tbsp" without one).
    const context = { ...EMPTY_CONTEXT, servingUnit: "tbsp", nutritionBasisUnit: "tbsp" };

    await resolveAndSaveAmount(
      { mealId: "meal-1", productId: "product-1", count: "2", unit: "tbsp", context, source: "manual" },
      dispatch, onSaved, callbacks,
    );

    expect(saveMealIngredient).toHaveBeenCalledWith({
      mealId: "meal-1", productId: "product-1", quantity: 2, quantityUnit: "tbsp", quantitySource: "manual",
    });
  });

  it("sets an error and never saves when the unit cannot be resolved", async () => {
    const dispatch = vi.fn();
    const onSaved = vi.fn();
    const callbacks = { setError: vi.fn(), setIsBusy: vi.fn() };

    await resolveAndSaveAmount(
      { mealId: "meal-1", productId: "product-1", count: "2", unit: "gummies", context: EMPTY_CONTEXT, source: "manual" },
      dispatch, onSaved, callbacks,
    );

    expect(saveMealIngredient).not.toHaveBeenCalled();
    expect(callbacks.setError).toHaveBeenCalledWith('Could not work out the amount in "gummies" - try a different unit.');
  });
});
