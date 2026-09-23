import { describe, expect, it, vi } from "vitest";

// confirm-step.tsx's production imports transitively pull in @/auth's real
// next-auth setup, which this Vitest/Node setup can't resolve (next-auth/
// lib/env.js's "next/server" import) - same shim confirm-step.test.ts uses.
vi.mock("@/auth", () => ({ auth: () => Promise.resolve(null) }));
vi.mock("@/features/products/actions/barcode", () => ({ checkBarcodeBinding: vi.fn() }));

import { toFieldValues } from "@/lib/ocr/nutrition-fields";
import type { NullableNutritionValues } from "@/lib/ocr/provider";

import { resolveNutritionOrigin } from "./confirm-step";

const PARSED: NullableNutritionValues = {
  energyKcal: 70, fatG: 2, saturatesG: 1.2, carbohydrateG: 4,
  sugarsG: 4, proteinG: 9, saltG: 0.18, fibreG: null,
};

const ALL_NULL: NullableNutritionValues = {
  energyKcal: null, fatG: null, saturatesG: null, carbohydrateG: null,
  sugarsG: null, proteinG: null, saltG: null, fibreG: null,
};

describe("resolveNutritionOrigin", () => {
  it("keeps label_photo when every figure is saved exactly as OCR read it", () => {
    expect(resolveNutritionOrigin(PARSED, toFieldValues(PARSED), null)).toBe("label_photo");
  });

  it("keeps the declared origin when an Open Food Facts hit is saved unedited", () => {
    expect(resolveNutritionOrigin(PARSED, toFieldValues(PARSED), "open_food_facts")).toBe("open_food_facts");
  });

  it("reports manual when the user changed a figure OCR had read", () => {
    const edited = { ...toFieldValues(PARSED), proteinG: "11" };

    expect(resolveNutritionOrigin(PARSED, edited, null)).toBe("manual");
  });

  it("reports manual when an Open Food Facts figure was retyped", () => {
    const edited = { ...toFieldValues(PARSED), energyKcal: "72" };

    expect(resolveNutritionOrigin(PARSED, edited, "open_food_facts")).toBe("manual");
  });

  it("reports manual on the OCR-failed fallback, where nothing was parsed", () => {
    expect(resolveNutritionOrigin(ALL_NULL, toFieldValues(PARSED), null)).toBe("manual");
  });

  it("does not call a reformatted figure a change", () => {
    const reformatted = { ...toFieldValues(PARSED), fatG: "2.0" };

    expect(resolveNutritionOrigin(PARSED, reformatted, null)).toBe("label_photo");
  });
});
