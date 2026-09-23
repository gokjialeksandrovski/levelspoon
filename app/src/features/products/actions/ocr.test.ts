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

vi.mock("@/features/products/actions/products", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/features/products/actions/products")>();
  return { ...actual, findStoredMeasures: mockFindStoredMeasures };
});

import { eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { extensionFromBytes, PROOF_PHOTO_PREFIX, toPhotoKey } from "@/lib/db/photo-keys";
import { toSearchText } from "@/lib/db/search-text";
import { products, users } from "@/lib/db/schema";
import { NOTHING_LEARNED } from "@/lib/measures/learn";
import type { MeasureContext } from "@/lib/measures/resolve-grams";

import { fromResolvedServing, needsServingSizeRead, ocrNutritionTable, ocrProductName, resolveServingSize, validateNutrition } from "./ocr";

const PER_SERVING_VALUES = {
  energyKcal: 190, fatG: 16, saturatesG: 3, carbohydrateG: 7, sugarsG: 3, proteinG: 8, saltG: 0.45, fibreG: null,
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

  it("creates a per-unit product straight to confirm when a count unit is recognized but not convertible", async () => {
    mockExtractNutritionTable.mockResolvedValue({
      format: "us",
      perServing: PER_SERVING_VALUES,
      servingSizeText: "1 bas",
      servingGrams: null,
      servingsPerContainer: null,
    });
    mockValidate.mockResolvedValue({ flags: [] });

    const result = await ocrNutritionTable(new Blob(["photo"]), "Snickers");

    expect(result.kind).toBe("per100g");
    if (result.kind !== "per100g") throw new Error("expected per100g");
    expect(result.nutritionBasisUnit).toBe("bas");
    expect(result.nutritionBasisQuantity).toBe(1);
    expect(result.values.energyKcal).toBeCloseTo(190, 2);
    expect(result.learned).toEqual({ densityGMl: null, servingUnit: "bas", servingGrams: null });
  });

  it("creates a per-unit product straight to confirm for a household measure with no known density (Nutella-shaped)", async () => {
    mockExtractNutritionTable.mockResolvedValue({
      format: "us",
      perServing: PER_SERVING_VALUES,
      servingSizeText: "2 Tablespoon",
      servingGrams: null,
    });
    mockValidate.mockResolvedValue({ flags: [] });

    const result = await ocrNutritionTable(new Blob(["photo"]), "Nutella Hazelnut Spread");

    expect(result.kind).toBe("per100g");
    if (result.kind !== "per100g") throw new Error("expected per100g");
    expect(result.nutritionBasisUnit).toBe("tbsp");
    expect(result.nutritionBasisQuantity).toBe(1);
    // Full 2-tablespoon perServing macros halve to one tablespoon's worth.
    expect(result.values.energyKcal).toBeCloseTo(190 / 2, 2);
    expect(result.values.fatG).toBeCloseTo(16 / 2, 2);
    expect(result.learned).toEqual({ densityGMl: null, servingUnit: "tbsp", servingGrams: null });
  });

  it("prefills a serving weight from the front panel's net weight and the label's own servings count", async () => {
    mockExtractNutritionTable.mockResolvedValue({
      format: "us",
      perServing: PER_SERVING_VALUES,
      servingSizeText: "one bar",
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
      servingSizeText: "one bar",
      perServing: PER_SERVING_VALUES,
      prefillGrams: expect.closeTo(52.7 / 48, 5),
      unitName: null,
    });
  });

  it("has no prefill when the label prints no servings-per-container count", async () => {
    mockExtractNutritionTable.mockResolvedValue({
      format: "us",
      perServing: PER_SERVING_VALUES,
      servingSizeText: "one bar",
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
      servingSizeText: "one bar",
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
      servingSizeText: "one bar",
      servingGrams: null,
      servingsPerContainer: 48,
    });

    const result = await ocrNutritionTable(new Blob(["photo"]), "Snickers", "NET WT one bar");

    expect(result).toMatchObject({ kind: "needs-serving-size", prefillGrams: null });
  });

  it("never assumes water for an unknown density - builds a per-unit product instead of guessing grams", async () => {
    mockExtractNutritionTable.mockResolvedValue({
      format: "us",
      perServing: PER_SERVING_VALUES,
      servingSizeText: "2 tbsp",
      servingGrams: null,
    });
    mockValidate.mockResolvedValue({ flags: [] });

    const result = await ocrNutritionTable(new Blob(["photo"]), "Mystery Spread");

    expect(result.kind).toBe("per100g");
    if (result.kind !== "per100g") throw new Error("expected per100g");
    expect(result.nutritionBasisUnit).toBe("tbsp");
    expect(result.nutritionBasisQuantity).toBe(1);
  });

  it("asks again rather than fast-pathing a zero-quantity recognized unit into an Infinity-valued product", async () => {
    mockExtractNutritionTable.mockResolvedValue({
      format: "us",
      perServing: PER_SERVING_VALUES,
      servingSizeText: "0 tbsp",
      servingGrams: null,
    });
    mockValidate.mockResolvedValue({ flags: [] });

    const result = await ocrNutritionTable(new Blob(["photo"]), "Mystery Spread");

    // resolveGrams("0 tbsp", ...) reports the recognized unit "tbsp" with
    // quantity 0 - non-null on both fields, same shape as "0g" (asserted in
    // resolve-grams.test.ts). Fast-pathing that into perUnitRead would divide
    // by zero and write Infinity into the shared products table.
    expect(result).toEqual({
      kind: "needs-serving-size",
      servingSizeText: "0 tbsp",
      perServing: PER_SERVING_VALUES,
      prefillGrams: null,
      unitName: "tbsp",
    });
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

  // Pins the ordering the whole of Task 3 rests on: the photo-owner probe
  // must run before the OCR call, or the answer handed back would be the
  // other product's figures - reading them is what makes the mistake look
  // right. mockExtractNutritionTable not being called is the actual proof;
  // a wrong result alone wouldn't show whether the provider was skipped.
  it("refuses before calling the OCR provider when the photo already belongs to another product", async () => {
    const buffer = Buffer.from("shared-label-bytes");
    const key = toPhotoKey(buffer, PROOF_PHOTO_PREFIX, extensionFromBytes(buffer));
    const [user] = await db
      .insert(users)
      .values({ email: `ocr-test-${crypto.randomUUID()}@example.com` })
      .returning();
    const [product] = await db
      .insert(products)
      .values({
        name: "Bella Farm Yoghurt",
        nameSearch: toSearchText("Bella Farm Yoghurt"),
        energyKcal: "70", fatG: "2.0", saturatesG: "1.2", carbohydrateG: "4.0",
        sugarsG: "4.0", proteinG: "9.0", saltG: "0.18",
        nutritionPhotoKey: key,
        createdByUserId: user.id,
      })
      .returning();

    try {
      const result = await ocrNutritionTable(new Blob([buffer]), "Candy Bar");

      expect(result).toEqual({ kind: "photo-already-used", ownerName: "Bella Farm Yoghurt" });
      expect(mockExtractNutritionTable).not.toHaveBeenCalled();
    } finally {
      await db.delete(products).where(eq(products.id, product.id));
      await db.delete(users).where(eq(users.id, user.id));
    }
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
      unitName: null,
    });
  });

  it("resolves a recognised-but-unconvertible unit straight to a per-unit product instead of asking again", async () => {
    const result = await resolveServingSize("2 tbsp", "2 Tablespoon", PER_SERVING_VALUES, "Nutella");

    expect(result.kind).toBe("per100g");
    if (result.kind !== "per100g") throw new Error("expected per100g");
    expect(result.nutritionBasisUnit).toBe("tbsp");
    expect(result.nutritionBasisQuantity).toBe(1);
    expect(result.values.energyKcal).toBeCloseTo(190 / 2, 2);
    expect(result.learned).toEqual({ densityGMl: null, servingUnit: "tbsp", servingGrams: null });
  });
});

describe("validateNutrition", () => {
  it("flags saturates exceeding fat via the mock provider", async () => {
    vi.stubEnv("OCR_PROVIDER", "mock");
    const result = await validateNutrition({
      energyKcal: 70, fatG: 2.0, saturatesG: 5.0, carbohydrateG: 4.0, sugarsG: 4.0, proteinG: 9.0, saltG: 0.18, fibreG: null,
    });
    expect(result.flags).toEqual(["fat_g", "saturates_g"]);
  });

  it("returns no flags for values that pass", async () => {
    vi.stubEnv("OCR_PROVIDER", "mock");
    const result = await validateNutrition({
      energyKcal: 70, fatG: 2.0, saturatesG: 1.2, carbohydrateG: 4.0, sugarsG: 4.0, proteinG: 9.0, saltG: 0.18, fibreG: null,
    });
    expect(result.flags).toEqual([]);
  });
});

describe("fromResolvedServing", () => {
  beforeEach(() => {
    vi.stubEnv("OCR_PROVIDER", "real");
    mockValidate.mockReset();
    mockValidate.mockResolvedValue({ flags: [] });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("learns the label's own density and scales to per-100g", async () => {
    const result = await fromResolvedServing(PER_SERVING_VALUES, "2 Tbsp (37g)", 37);

    expect(result.kind).toBe("per100g");
    if (result.kind !== "per100g") throw new Error("expected per100g");
    expect(result.learned.densityGMl).toBeCloseTo(1.2333, 4);
    expect(result.values.energyKcal).toBeCloseTo((190 / 37) * 100, 2);
  });

  it("learns nothing when the printed serving already states a mass", async () => {
    const result = await fromResolvedServing(PER_SERVING_VALUES, "30 g", 30);

    if (result.kind !== "per100g") throw new Error("expected per100g");
    expect(result.learned).toEqual(NOTHING_LEARNED);
  });
});

describe("needsServingSizeRead", () => {
  const usRead = {
    format: "us" as const,
    perServing: PER_SERVING_VALUES,
    servingSizeText: "1 bar",
    servingGrams: null,
    servingsPerContainer: 2,
  };
  const context: MeasureContext = { productName: "Snickers", densityGMl: null, servingUnit: null, servingGrams: null, nutritionBasisUnit: "g", portions: [] };

  it("prefills grams from the net weight divided by servings per container", async () => {
    const result = await needsServingSizeRead(usRead, "NET WT 12 OZ (340g)", context, "bar");

    if (result.kind !== "needs-serving-size") throw new Error("expected needs-serving-size");
    expect(result).toEqual({
      kind: "needs-serving-size",
      servingSizeText: "1 bar",
      perServing: PER_SERVING_VALUES,
      prefillGrams: 170,
      unitName: "bar",
    });
  });

  it("leaves the prefill null when there is no net weight text", async () => {
    const result = await needsServingSizeRead(usRead, null, context, "bar");

    if (result.kind !== "needs-serving-size") throw new Error("expected needs-serving-size");
    expect(result.prefillGrams).toBeNull();
  });

  it("passes the unresolved unit name through unchanged", async () => {
    const result = await needsServingSizeRead(usRead, null, context, null);

    if (result.kind !== "needs-serving-size") throw new Error("expected needs-serving-size");
    expect(result.unitName).toBeNull();
  });
});
