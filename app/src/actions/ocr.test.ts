import { describe, expect, it, vi } from "vitest";

vi.stubEnv("OCR_PROVIDER", "mock");
vi.mock("@/auth", () => ({ auth: () => Promise.resolve({ user: { id: crypto.randomUUID() } }) }));

import { ocrNutritionTable, ocrProductName, validateNutrition } from "./ocr";

describe("ocrProductName", () => {
  it("returns the marker-matched product name from the mock provider", async () => {
    const result = await ocrProductName(new Blob(["confident"]));
    expect(result.text).toBe("Olympus Greek Yogurt 2% Fat");
  });

  it("falls back to a default when the marker is unrecognized", async () => {
    const result = await ocrProductName(new Blob(["not-a-marker"]));
    expect(result.text.length).toBeGreaterThan(0);
  });
});

describe("ocrNutritionTable", () => {
  it("returns parsed values and no flags from the mock provider", async () => {
    const result = await ocrNutritionTable(new Blob(["anything"]));
    expect(result.values.energyKcal).toBe(70);
    expect(result.flags).toEqual([]);
  });
});

describe("validateNutrition", () => {
  it("flags saturates exceeding fat via the mock provider", async () => {
    const result = await validateNutrition({
      energyKcal: 70, fatG: 2.0, saturatesG: 5.0, carbohydrateG: 4.0, sugarsG: 4.0, proteinG: 9.0, saltG: 0.18,
    });
    expect(result.flags).toEqual(["fat_g", "saturates_g"]);
  });

  it("returns no flags for values that pass", async () => {
    const result = await validateNutrition({
      energyKcal: 70, fatG: 2.0, saturatesG: 1.2, carbohydrateG: 4.0, sugarsG: 4.0, proteinG: 9.0, saltG: 0.18,
    });
    expect(result.flags).toEqual([]);
  });
});
