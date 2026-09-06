import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/actions/meals", () => ({ saveMealIngredient: vi.fn() }));
vi.mock("@/lib/haptics/log-success", () => ({ triggerLogSuccessHaptic: vi.fn() }));

import { saveMealIngredient } from "@/actions/meals";
import { triggerLogSuccessHaptic } from "@/lib/haptics/log-success";

import { saveAmount } from "./amount-step";

afterEach(() => {
  vi.clearAllMocks();
});

const baseInput = { mealId: "meal-1", productId: "product-1", grams: "150", source: "manual" as const };

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
