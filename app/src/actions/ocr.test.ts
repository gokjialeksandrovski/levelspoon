import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockExtractNutritionTable, mockValidate, mockConvertServingSize } = vi.hoisted(() => ({
  mockExtractNutritionTable: vi.fn(),
  mockValidate: vi.fn(),
  mockConvertServingSize: vi.fn(),
}));

vi.stubEnv("OCR_PROVIDER", "mock");
vi.mock("@/auth", () => ({ auth: () => Promise.resolve({ user: { id: crypto.randomUUID() } }) }));

vi.mock("@/lib/ocr/http-provider", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/ocr/http-provider")>();
  return {
    ...actual,
    HttpOcrProvider: class {
      extractProductName = vi.fn();
      extractNutritionTable = mockExtractNutritionTable;
      validate = mockValidate;
    },
  };
});

vi.mock("@/actions/serving-size", () => ({
  convertServingSize: mockConvertServingSize,
}));

import { ServingGramsUnavailableError } from "@/lib/ocr/http-provider";

import { ocrNutritionTable, ocrProductName, validateNutrition } from "./ocr";

const PER_SERVING_VALUES = {
  energyKcal: 190, fatG: 16, saturatesG: 3, carbohydrateG: 7, sugarsG: 3, proteinG: 8, saltG: 0.45,
};

const ALREADY_SCALED_VALUES = {
  energyKcal: 633.33, fatG: 53.33, saturatesG: 10, carbohydrateG: 23.33, sugarsG: 10, proteinG: 26.67, saltG: 1.5,
};

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

describe("ocrNutritionTable — EU label via the mock provider", () => {
  it("returns parsed values and no flags", async () => {
    const result = await ocrNutritionTable(new Blob(["anything"]), "Olympus Greek Yogurt 2% Fat");
    expect(result.values.energyKcal).toBe(70);
    expect(result.flags).toEqual([]);
  });
});

describe("ocrNutritionTable — US label orchestration (HttpOcrProvider mocked)", () => {
  beforeEach(() => {
    vi.stubEnv("OCR_PROVIDER", "real");
    mockExtractNutritionTable.mockReset();
    mockValidate.mockReset();
    mockConvertServingSize.mockReset();
  });

  it("returns scaled values directly when the label already carries a gram weight", async () => {
    mockExtractNutritionTable.mockResolvedValue({ values: ALREADY_SCALED_VALUES, flags: [] });

    const result = await ocrNutritionTable(new Blob(["photo"]), "Peanut Butter");

    expect(result).toEqual({ values: ALREADY_SCALED_VALUES, flags: [] });
    expect(mockConvertServingSize).not.toHaveBeenCalled();
  });

  it("falls back to the OmniRoute grams lookup when the serving size has no printed weight", async () => {
    mockExtractNutritionTable.mockRejectedValue(
      new ServingGramsUnavailableError("2 Tablespoon", PER_SERVING_VALUES),
    );
    mockConvertServingSize.mockResolvedValue({ grams: 30 });
    mockValidate.mockResolvedValue({ flags: [] });

    const result = await ocrNutritionTable(new Blob(["photo"]), "Peanut Butter");

    expect(mockConvertServingSize).toHaveBeenCalledWith("2 Tablespoon", "Peanut Butter");
    expect(result.values.energyKcal).toBeCloseTo((190 / 30) * 100);
    expect(result.flags).toEqual([]);
    expect(mockValidate).toHaveBeenCalledWith(
      expect.objectContaining({ energyKcal: expect.closeTo((190 / 30) * 100, 2) }),
    );
  });

  it("propagates the error uncaught when the OmniRoute grams lookup itself fails", async () => {
    mockExtractNutritionTable.mockRejectedValue(
      new ServingGramsUnavailableError("2 Tablespoon", PER_SERVING_VALUES),
    );
    mockConvertServingSize.mockRejectedValue(new Error("Serving size estimation failed"));

    await expect(ocrNutritionTable(new Blob(["photo"]), "Peanut Butter")).rejects.toThrow(
      "Serving size estimation failed",
    );
  });
});

describe("validateNutrition", () => {
  it("flags saturates exceeding fat via the mock provider", async () => {
    vi.stubEnv("OCR_PROVIDER", "mock");
    const result = await validateNutrition({
      energyKcal: 70, fatG: 2.0, saturatesG: 5.0, carbohydrateG: 4.0, sugarsG: 4.0, proteinG: 9.0, saltG: 0.18,
    });
    expect(result.flags).toEqual(["fat_g", "saturates_g"]);
  });

  it("returns no flags for values that pass", async () => {
    vi.stubEnv("OCR_PROVIDER", "mock");
    const result = await validateNutrition({
      energyKcal: 70, fatG: 2.0, saturatesG: 1.2, carbohydrateG: 4.0, sugarsG: 4.0, proteinG: 9.0, saltG: 0.18,
    });
    expect(result.flags).toEqual([]);
  });
});
