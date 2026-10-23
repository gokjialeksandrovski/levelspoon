import { afterEach, describe, expect, it, vi } from "vitest";

// AppHeader pulls next-auth/react in, which will not resolve under the node
// test env. saveCorrection never touches it.
vi.mock("@/components/layout/app-header", () => ({ AppHeader: () => null }));
vi.mock("@/features/products/actions/ocr", () => ({ validateNutrition: vi.fn() }));
vi.mock("@/features/products/actions/products", () => ({
  saveNutritionOverride: vi.fn(),
  clearNutritionOverride: vi.fn(),
  renameOwnProduct: vi.fn(),
  attachLabelProof: vi.fn(),
}));
// Reached through the proof disclosure this form renders: barcode.ts pulls
// next-auth in, which will not resolve under the node test env either.
vi.mock("@/features/products/actions/barcode", () => ({ linkBarcode: vi.fn(), lookupBarcode: vi.fn() }));
vi.mock("@/lib/barcode/read-photo", () => ({ readBarcodeFromPhoto: vi.fn() }));
vi.mock("@/lib/haptics/log-success", () => ({ triggerLogSuccessHaptic: vi.fn() }));

import { validateNutrition } from "@/features/products/actions/ocr";
import { clearNutritionOverride, renameOwnProduct, saveNutritionOverride } from "@/features/products/actions/products";
import { triggerLogSuccessHaptic } from "@/lib/haptics/log-success";

import { revertCorrection, saveCorrection } from "./correction-form";

// focusFirstFlagged reaches for the flagged input; nothing is mounted here.
vi.stubGlobal("document", { getElementById: () => null });

afterEach(() => {
  vi.clearAllMocks();
});

const NUTRITION = {
  energyKcal: 250, fatG: 10, saturatesG: 2, carbohydrateG: 30, sugarsG: 5, proteinG: 8, saltG: 0.5, fibreG: null,
};

const PRODUCT = {
  id: "product-1",
  name: "Oat biscuits",
  nutritionPer100g: NUTRITION,
  originalNutritionPer100g: NUTRITION,
  hasOverride: false,
  hasOverridePhoto: false,
  canRename: true,
  nutritionBasisUnit: "g",
  nutritionBasisQuantity: 100,
  nutritionPhotoKey: "products/oat-biscuits.jpg",
  sharedProof: "label" as const,
  hasBarcode: false,
};

const VALUES = {
  energyKcal: "260", fatG: "10", saturatesG: "2", carbohydrateG: "30", sugarsG: "5", proteinG: "8", saltG: "0.5", fibreG: "",
};

const makeCallbacks = () => ({
  setIsSaving: vi.fn(), setSaveError: vi.fn(), setFlags: vi.fn(), setIsSaved: vi.fn(),
});

describe("saveCorrection", () => {
  it("marks the correction saved so the confirmation can hold before navigating", async () => {
    vi.mocked(validateNutrition).mockResolvedValue({ flags: [] });
    vi.mocked(saveNutritionOverride).mockResolvedValue({ kind: "saved" });
    const callbacks = makeCallbacks();

    await saveCorrection(PRODUCT, "Oat biscuits", VALUES, null, callbacks);

    expect(saveNutritionOverride).toHaveBeenCalledTimes(1);
    expect(triggerLogSuccessHaptic).toHaveBeenCalledTimes(1);
    expect(callbacks.setIsSaved).toHaveBeenCalledWith(true);
  });

  it("shows the borrowed-photo refusal instead of the generic retry message", async () => {
    vi.mocked(validateNutrition).mockResolvedValue({ flags: [] });
    vi.mocked(saveNutritionOverride).mockResolvedValue({ kind: "photo_already_used", ownerName: "Other Product" });
    const callbacks = makeCallbacks();
    const photo = new File(["bytes"], "label.jpg", { type: "image/jpeg" });

    await saveCorrection(PRODUCT, PRODUCT.name, VALUES, photo, callbacks);

    expect(renameOwnProduct).not.toHaveBeenCalled();
    expect(triggerLogSuccessHaptic).not.toHaveBeenCalled();
    expect(callbacks.setIsSaved).not.toHaveBeenCalled();
    expect(callbacks.setSaveError).toHaveBeenCalledWith(
      "This label photo already belongs to Other Product. Take a photo of this product's own label.",
    );
  });

  it("writes the override before renaming, so a borrowed photo leaves no rename committed", async () => {
    vi.mocked(validateNutrition).mockResolvedValue({ flags: [] });
    const order: string[] = [];
    vi.mocked(saveNutritionOverride).mockImplementation(async () => {
      order.push("override");
      return { kind: "saved" };
    });
    vi.mocked(renameOwnProduct).mockImplementation(async () => {
      order.push("rename");
    });

    await saveCorrection({ ...PRODUCT, canRename: true }, "New Name", VALUES, null, makeCallbacks());

    expect(order).toEqual(["override", "rename"]);
  });

  it("never confirms a save that was blocked by a flagged value", async () => {
    vi.mocked(validateNutrition).mockResolvedValue({ flags: ["energy_kcal"] });
    const callbacks = makeCallbacks();

    await saveCorrection(PRODUCT, "Oat biscuits", VALUES, null, callbacks);

    expect(saveNutritionOverride).not.toHaveBeenCalled();
    expect(triggerLogSuccessHaptic).not.toHaveBeenCalled();
    expect(callbacks.setIsSaved).not.toHaveBeenCalled();
    expect(callbacks.setSaveError).toHaveBeenCalledWith("Please fix the flagged values before saving.");
  });

  it("never confirms a save the server rejected", async () => {
    vi.mocked(validateNutrition).mockResolvedValue({ flags: [] });
    vi.mocked(saveNutritionOverride).mockRejectedValue(new Error("db down"));
    const callbacks = makeCallbacks();

    await saveCorrection(PRODUCT, "Oat biscuits", VALUES, null, callbacks);

    expect(triggerLogSuccessHaptic).not.toHaveBeenCalled();
    expect(callbacks.setIsSaved).not.toHaveBeenCalled();
    expect(callbacks.setSaveError).toHaveBeenCalledWith("Could not save this correction. Please try again.");
  });

  it("writes the override, and only renames when the user may", async () => {
    vi.mocked(validateNutrition).mockResolvedValue({ flags: [] });
    vi.mocked(saveNutritionOverride).mockResolvedValue({ kind: "saved" });
    vi.mocked(renameOwnProduct).mockResolvedValue(undefined);

    await saveCorrection({ ...PRODUCT, canRename: false }, "New Name", VALUES, null, makeCallbacks());

    expect(renameOwnProduct).not.toHaveBeenCalled();
    expect(saveNutritionOverride).toHaveBeenCalledTimes(1);
  });

  it("saves the figures with no photo when none was chosen", async () => {
    vi.mocked(validateNutrition).mockResolvedValue({ flags: [] });
    vi.mocked(saveNutritionOverride).mockResolvedValue({ kind: "saved" });

    await saveCorrection(PRODUCT, PRODUCT.name, VALUES, null, makeCallbacks());

    expect(saveNutritionOverride).toHaveBeenCalledWith(PRODUCT.id, expect.anything(), undefined);
  });

  it("forwards a chosen replacement photo", async () => {
    vi.mocked(validateNutrition).mockResolvedValue({ flags: [] });
    vi.mocked(saveNutritionOverride).mockResolvedValue({ kind: "saved" });
    const photo = new File(["bytes"], "label.jpg", { type: "image/jpeg" });

    await saveCorrection(PRODUCT, PRODUCT.name, VALUES, photo, makeCallbacks());

    expect(saveNutritionOverride).toHaveBeenCalledWith(PRODUCT.id, expect.anything(), photo);
  });
});

const makeRevertCallbacks = () => ({
  setIsReverting: vi.fn(), setSaveError: vi.fn(), onReverted: vi.fn(),
});

describe("revertCorrection", () => {
  it("re-reads the screen once the override is gone", async () => {
    vi.mocked(clearNutritionOverride).mockResolvedValue(undefined);
    const callbacks = makeRevertCallbacks();

    await revertCorrection(PRODUCT.id, callbacks);

    expect(clearNutritionOverride).toHaveBeenCalledWith(PRODUCT.id);
    expect(callbacks.onReverted).toHaveBeenCalledTimes(1);
    expect(callbacks.setIsReverting).toHaveBeenLastCalledWith(false);
  });

  it("never claims a revert the server rejected", async () => {
    vi.mocked(clearNutritionOverride).mockRejectedValue(new Error("db down"));
    const callbacks = makeRevertCallbacks();

    await revertCorrection(PRODUCT.id, callbacks);

    expect(callbacks.onReverted).not.toHaveBeenCalled();
    expect(callbacks.setSaveError).toHaveBeenCalledWith("Could not restore the original values. Please try again.");
  });
});
