import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/features/meals/actions/meals", () => ({ saveMealIngredient: vi.fn() }));
vi.mock("@/lib/haptics/log-success", () => ({ triggerLogSuccessHaptic: vi.fn() }));
// amount-step also imports these two action modules; unmocked, they pull
// next-auth's env module in, which fails to resolve under Vitest and takes
// the whole file down before a single test runs.
vi.mock("@/features/products/actions/portions", () => ({ getPortions: vi.fn() }));
vi.mock("@/features/quantity/actions/quantity", () => ({ estimateQuantity: vi.fn() }));

import { saveMealIngredient } from "@/features/meals/actions/meals";
import { triggerLogSuccessHaptic } from "@/lib/haptics/log-success";

import { acceptBarcodeLinkOffer, resolveAndSaveAmount, saveAmount } from "./amount-step";

vi.mock("@/features/products/actions/barcode", () => ({ linkBarcode: vi.fn() }));

import { linkBarcode } from "@/features/products/actions/barcode";

afterEach(() => {
  vi.clearAllMocks();
});

const baseInput = { mealId: "meal-1", productId: "product-1", quantity: 150, quantityUnit: "g", entryCount: 150, entryUnit: "g", source: "manual" as const };

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

const EMPTY_CONTEXT = { productName: "Test", densityGMl: null, servingUnit: null, servingGrams: null, nutritionBasisUnit: "g", portions: [] };

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
      mealId: "meal-1", productId: "product-1", quantity: 150, quantityUnit: "g", entryCount: 150, entryUnit: "g", quantitySource: "manual",
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
      mealId: "meal-1", productId: "product-1", quantity: 104, quantityUnit: "g", entryCount: 2, entryUnit: "bar", quantitySource: "manual",
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
      mealId: "meal-1", productId: "product-1", quantity: 2, quantityUnit: "tbsp", entryCount: 2, entryUnit: "tbsp", quantitySource: "manual",
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

describe("acceptBarcodeLinkOffer", () => {
  it("calls onLinked when the barcode links cleanly", async () => {
    vi.mocked(linkBarcode).mockResolvedValue({ kind: "linked" });
    const callbacks = { onLinked: vi.fn(), onConflict: vi.fn(), onError: vi.fn() };

    await acceptBarcodeLinkOffer("5901234123457", "product-1", callbacks);

    expect(linkBarcode).toHaveBeenCalledWith("5901234123457", "product-1");
    expect(callbacks.onLinked).toHaveBeenCalledTimes(1);
    expect(callbacks.onConflict).not.toHaveBeenCalled();
  });

  it("calls onConflict with the other product when the barcode is already bound elsewhere", async () => {
    const otherProduct = { id: "product-2", name: "Other Product" };
    vi.mocked(linkBarcode).mockResolvedValue({ kind: "already_linked_elsewhere", product: otherProduct as never });
    const callbacks = { onLinked: vi.fn(), onConflict: vi.fn(), onError: vi.fn() };

    await acceptBarcodeLinkOffer("5901234123457", "product-1", callbacks);

    expect(callbacks.onConflict).toHaveBeenCalledWith(otherProduct);
    expect(callbacks.onLinked).not.toHaveBeenCalled();
  });

  it("calls onError when linkBarcode throws", async () => {
    vi.mocked(linkBarcode).mockRejectedValue(new Error("db down"));
    const callbacks = { onLinked: vi.fn(), onConflict: vi.fn(), onError: vi.fn() };

    await acceptBarcodeLinkOffer("5901234123457", "product-1", callbacks);

    expect(callbacks.onError).toHaveBeenCalledWith("Could not link this barcode. Please try again.");
  });
});

describe("pickChip", () => {
  it("saves a tapped portion chip as grams, at manual source", async () => {
    vi.mocked(saveMealIngredient).mockResolvedValue({ mealIngredientId: "mi-1" });

    await resolveAndSaveAmount(
      {
        mealId: "meal-1",
        productId: "product-1",
        count: "1",
        unit: "slice",
        context: {
          productName: "Bread, white",
          densityGMl: null,
          servingUnit: null,
          servingGrams: null,
          nutritionBasisUnit: "g",
          portions: [{ label: "slice", grams: 28 }],
        },
        source: "manual",
      },
      vi.fn(),
      vi.fn(),
      { setError: vi.fn(), setIsBusy: vi.fn() },
    );

    expect(saveMealIngredient).toHaveBeenCalledWith({
      mealId: "meal-1",
      productId: "product-1",
      quantity: 28,
      quantityUnit: "g",
      entryCount: 1,
      entryUnit: "slice",
      quantitySource: "manual",
    });
  });
});
