import { afterEach, describe, expect, it, vi } from "vitest";

// AppHeader pulls next-auth/react in, which will not resolve under the node
// test env. saveCorrection never touches it.
vi.mock("@/components/layout/app-header", () => ({ AppHeader: () => null }));
vi.mock("@/features/products/actions/ocr", () => ({ validateNutrition: vi.fn() }));
vi.mock("@/features/products/actions/products", () => ({ updateProduct: vi.fn() }));
vi.mock("@/lib/haptics/log-success", () => ({ triggerLogSuccessHaptic: vi.fn() }));

import { validateNutrition } from "@/features/products/actions/ocr";
import { updateProduct } from "@/features/products/actions/products";
import { triggerLogSuccessHaptic } from "@/lib/haptics/log-success";

import { saveCorrection } from "./correction-form";

// focusFirstFlagged reaches for the flagged input; nothing is mounted here.
vi.stubGlobal("document", { getElementById: () => null });

afterEach(() => {
  vi.clearAllMocks();
});

const NUTRITION = {
  energyKcal: 250, fatG: 10, saturatesG: 2, carbohydrateG: 30, sugarsG: 5, proteinG: 8, saltG: 0.5,
};

const PRODUCT = {
  id: "product-1",
  name: "Oat biscuits",
  nutritionPer100g: NUTRITION,
  nutritionBasisUnit: "g",
  nutritionBasisQuantity: 100,
};

const VALUES = {
  energyKcal: "260", fatG: "10", saturatesG: "2", carbohydrateG: "30", sugarsG: "5", proteinG: "8", saltG: "0.5",
};

const makeCallbacks = () => ({
  setIsSaving: vi.fn(), setSaveError: vi.fn(), setFlags: vi.fn(), setIsSaved: vi.fn(),
});

describe("saveCorrection", () => {
  it("marks the correction saved so the confirmation can hold before navigating", async () => {
    vi.mocked(validateNutrition).mockResolvedValue({ flags: [] });
    vi.mocked(updateProduct).mockResolvedValue(undefined);
    const callbacks = makeCallbacks();

    await saveCorrection(PRODUCT, "Oat biscuits", VALUES, callbacks);

    expect(updateProduct).toHaveBeenCalledTimes(1);
    expect(triggerLogSuccessHaptic).toHaveBeenCalledTimes(1);
    expect(callbacks.setIsSaved).toHaveBeenCalledWith(true);
  });

  it("never confirms a save that was blocked by a flagged value", async () => {
    vi.mocked(validateNutrition).mockResolvedValue({ flags: ["energy_kcal"] });
    const callbacks = makeCallbacks();

    await saveCorrection(PRODUCT, "Oat biscuits", VALUES, callbacks);

    expect(updateProduct).not.toHaveBeenCalled();
    expect(triggerLogSuccessHaptic).not.toHaveBeenCalled();
    expect(callbacks.setIsSaved).not.toHaveBeenCalled();
    expect(callbacks.setSaveError).toHaveBeenCalledWith("Please fix the flagged values before saving.");
  });

  it("never confirms a save the server rejected", async () => {
    vi.mocked(validateNutrition).mockResolvedValue({ flags: [] });
    vi.mocked(updateProduct).mockRejectedValue(new Error("db down"));
    const callbacks = makeCallbacks();

    await saveCorrection(PRODUCT, "Oat biscuits", VALUES, callbacks);

    expect(triggerLogSuccessHaptic).not.toHaveBeenCalled();
    expect(callbacks.setIsSaved).not.toHaveBeenCalled();
    expect(callbacks.setSaveError).toHaveBeenCalledWith("Could not save this correction. Please try again.");
  });
});
