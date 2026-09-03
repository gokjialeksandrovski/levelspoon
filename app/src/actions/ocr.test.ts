import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { mockExtractNutritionTable, mockValidate, mockFindStoredMeasures } = vi.hoisted(() => ({
  mockExtractNutritionTable: vi.fn(),
  mockValidate: vi.fn(),
  mockFindStoredMeasures: vi.fn(),
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

vi.mock("@/actions/products", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/actions/products")>();
  return { ...actual, findStoredMeasures: mockFindStoredMeasures };
});

import { NOTHING_LEARNED } from "@/lib/measures/learn";

import { ocrNutritionTable, ocrProductName, resolveServingSize, validateNutrition } from "./ocr";

const PER_SERVING_VALUES = {
  energyKcal: 190, fatG: 16, saturatesG: 3, carbohydrateG: 7, sugarsG: 3, proteinG: 8, saltG: 0.45,
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
    expect(result.kind).toBe("per100g");
    if (result.kind !== "per100g") throw new Error("expected per100g");
    expect(result.values.energyKcal).toBe(70);
    expect(result.flags).toEqual([]);
  });
});

describe("ocrNutritionTable — US label orchestration (HttpOcrProvider mocked)", () => {
  beforeEach(() => {
    vi.stubEnv("OCR_PROVIDER", "real");
    mockExtractNutritionTable.mockReset();
    mockValidate.mockReset();
    mockFindStoredMeasures.mockReset();
    mockFindStoredMeasures.mockResolvedValue(NOTHING_LEARNED);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("scales a printed gram weight to per-100g and revalidates", async () => {
    mockExtractNutritionTable.mockResolvedValue({
      format: "us",
      perServing: PER_SERVING_VALUES,
      servingSizeText: "2 Tbsp (30g)",
      servingGrams: 30,
    });
    mockValidate.mockResolvedValue({ flags: [] });

    const result = await ocrNutritionTable(new Blob(["photo"]), "Peanut Butter");

    expect(result.kind).toBe("per100g");
    expect(result).toMatchObject({ flags: [] });
    if (result.kind !== "per100g") throw new Error("expected per100g");
    expect(result.values.energyKcal).toBeCloseTo((190 / 30) * 100, 2);
  });

  it("captures the density a label states for free when it prints both a volume and a weight", async () => {
    mockExtractNutritionTable.mockResolvedValue({
      format: "us",
      perServing: PER_SERVING_VALUES,
      servingSizeText: "2 Tbsp (37g)",
      servingGrams: 37,
    });
    mockValidate.mockResolvedValue({ flags: [] });

    const result = await ocrNutritionTable(new Blob(["photo"]), "Nutella");

    if (result.kind !== "per100g") throw new Error("expected per100g");
    expect(result.learned.densityGMl).toBeCloseTo(1.2333, 4);
  });

  it("resolves a volume serving through the seeded density table with no printed weight", async () => {
    mockExtractNutritionTable.mockResolvedValue({
      format: "us",
      perServing: PER_SERVING_VALUES,
      servingSizeText: "1 cup",
      servingGrams: null,
    });
    mockValidate.mockResolvedValue({ flags: [] });

    const result = await ocrNutritionTable(new Blob(["photo"]), "Plain Flour");

    if (result.kind !== "per100g") throw new Error("expected per100g");
    // 240 mL x 0.53 g/mL = 127.2 g
    expect(result.values.energyKcal).toBeCloseTo((190 / 127.2) * 100, 2);
  });

  it("uses a serving weight already learned for this product instead of asking again", async () => {
    mockExtractNutritionTable.mockResolvedValue({
      format: "us",
      perServing: PER_SERVING_VALUES,
      servingSizeText: "1 bas",
      servingGrams: null,
    });
    mockFindStoredMeasures.mockResolvedValue({
      densityGMl: null,
      servingUnit: "bas",
      servingGrams: 52,
    });
    mockValidate.mockResolvedValue({ flags: [] });

    const result = await ocrNutritionTable(new Blob(["photo"]), "Snickers");

    expect(result.kind).toBe("per100g");
    if (result.kind !== "per100g") throw new Error("expected per100g");
    expect(result.values.energyKcal).toBeCloseTo((190 / 52) * 100, 2);
    // The new row starts with all three learned columns NULL, so the weight
    // resolved via the lookup is this row's first-ever learned data - it
    // gets persisted onto the row rather than discarded.
    expect(result.learned).toEqual({ densityGMl: null, servingUnit: "bas", servingGrams: 52 });
  });

  it("asks for a serving size when nothing can resolve a count unit", async () => {
    mockExtractNutritionTable.mockResolvedValue({
      format: "us",
      perServing: PER_SERVING_VALUES,
      servingSizeText: "1 bas",
      servingGrams: null,
      servingsPerContainer: null,
    });

    const result = await ocrNutritionTable(new Blob(["photo"]), "Snickers");

    expect(result).toEqual({
      kind: "needs-serving-size",
      servingSizeText: "1 bas",
      perServing: PER_SERVING_VALUES,
      prefillGrams: null,
    });
    expect(mockValidate).not.toHaveBeenCalled();
  });

  it("prefills a serving weight from the front panel's net weight and the label's own servings count", async () => {
    mockExtractNutritionTable.mockResolvedValue({
      format: "us",
      perServing: PER_SERVING_VALUES,
      servingSizeText: "1 bar",
      servingGrams: null,
      servingsPerContainer: 48,
    });

    const result = await ocrNutritionTable(
      new Blob(["photo"]),
      "Snickers",
      "NET WT 1.86 0Z (52.7g)",
    );

    expect(result).toEqual({
      kind: "needs-serving-size",
      servingSizeText: "1 bar",
      perServing: PER_SERVING_VALUES,
      prefillGrams: expect.closeTo(52.7 / 48, 5),
    });
  });

  it("has no prefill when the label prints no servings-per-container count", async () => {
    mockExtractNutritionTable.mockResolvedValue({
      format: "us",
      perServing: PER_SERVING_VALUES,
      servingSizeText: "1 bar",
      servingGrams: null,
      servingsPerContainer: null,
    });

    const result = await ocrNutritionTable(
      new Blob(["photo"]),
      "Snickers",
      "NET WT 1.86 0Z (52.7g)",
    );

    expect(result).toMatchObject({ kind: "needs-serving-size", prefillGrams: null });
  });

  it("has no prefill when the front panel photo printed no net weight", async () => {
    mockExtractNutritionTable.mockResolvedValue({
      format: "us",
      perServing: PER_SERVING_VALUES,
      servingSizeText: "1 bar",
      servingGrams: null,
      servingsPerContainer: 48,
    });

    const result = await ocrNutritionTable(new Blob(["photo"]), "Snickers", null);

    expect(result).toMatchObject({ kind: "needs-serving-size", prefillGrams: null });
  });

  it("has no prefill when the net weight text itself cannot be resolved", async () => {
    mockExtractNutritionTable.mockResolvedValue({
      format: "us",
      perServing: PER_SERVING_VALUES,
      servingSizeText: "1 bar",
      servingGrams: null,
      servingsPerContainer: 48,
    });

    const result = await ocrNutritionTable(new Blob(["photo"]), "Snickers", "NET WT one bar");

    expect(result).toMatchObject({ kind: "needs-serving-size", prefillGrams: null });
  });

  it("never assumes water for an unknown density", async () => {
    mockExtractNutritionTable.mockResolvedValue({
      format: "us",
      perServing: PER_SERVING_VALUES,
      servingSizeText: "2 tbsp",
      servingGrams: null,
    });

    const result = await ocrNutritionTable(new Blob(["photo"]), "Mystery Spread");

    expect(result.kind).toBe("needs-serving-size");
  });

  it("returns the flags from the revalidate call", async () => {
    mockExtractNutritionTable.mockResolvedValue({
      format: "us",
      perServing: PER_SERVING_VALUES,
      servingSizeText: "2 Tbsp (30g)",
      servingGrams: 30,
    });
    mockValidate.mockResolvedValue({ flags: ["energy_kcal"] });

    const result = await ocrNutritionTable(new Blob(["photo"]), "Peanut Butter");

    expect(result).toMatchObject({ flags: ["energy_kcal"] });
  });
});

describe("resolveServingSize", () => {
  beforeEach(() => {
    vi.stubEnv("OCR_PROVIDER", "real");
    mockValidate.mockReset();
    mockValidate.mockResolvedValue({ flags: [] });
    mockFindStoredMeasures.mockReset();
    mockFindStoredMeasures.mockResolvedValue(NOTHING_LEARNED);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("accepts a gram answer and learns the count unit's weight", async () => {
    const result = await resolveServingSize("52g", "1 bas", PER_SERVING_VALUES, "Snickers");

    if (result.kind !== "per100g") throw new Error("expected per100g");
    expect(result.values.energyKcal).toBeCloseTo((190 / 52) * 100, 2);
    expect(result.learned).toEqual({ densityGMl: null, servingUnit: "bas", servingGrams: 52 });
  });

  it("accepts an ounce answer, because US packages print net weight in ounces", async () => {
    const result = await resolveServingSize("1.8 oz", "1 bas", PER_SERVING_VALUES, "Snickers");

    if (result.kind !== "per100g") throw new Error("expected per100g");
    expect(result.learned.servingGrams).toBeCloseTo(51.03, 2);
  });

  it("asks again rather than guessing when the answer itself cannot be resolved", async () => {
    const result = await resolveServingSize("one bar", "1 bas", PER_SERVING_VALUES, "Snickers");

    expect(result).toEqual({
      kind: "needs-serving-size",
      servingSizeText: "1 bas",
      perServing: PER_SERVING_VALUES,
      prefillGrams: null,
    });
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
