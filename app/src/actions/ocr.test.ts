import { describe, expect, it, vi } from "vitest";

vi.stubEnv("OCR_PROVIDER", "mock");
vi.mock("@/auth", () => ({ auth: () => Promise.resolve({ user: { id: crypto.randomUUID() } }) }));

import { ocrNutritionTable, ocrProductName } from "./ocr";

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
