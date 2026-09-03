import { afterEach, describe, expect, it, vi } from "vitest";

vi.stubEnv("OCR_SERVICE_URL", "http://localhost:8000");

import { HttpOcrProvider } from "./http-provider";

// ocr-service's actual wire shape (main spec's documented snake_case field
// naming), reproduced here so this test guards HttpOcrProvider's mapping
// without needing a real OCR call - the golden values from
// fixtures/golden/olympus-greek-2pct.json, already proven against the real
// service by tier-5 (real-stack.spec.ts).
const GOLDEN_RAW_VALUES = {
  energy_kcal: 70,
  fat_g: 2.0,
  saturates_g: 1.2,
  carbohydrate_g: 4.0,
  sugars_g: 4.0,
  protein_g: 9.0,
  salt_g: 0.18,
};

const stubFetchJson = (body: unknown) => {
  const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve(body) });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("HttpOcrProvider.extractProductName", () => {
  it("maps the net-weight declaration to camelCase", async () => {
    stubFetchJson({ text: "SNICKERS BAR", net_weight_text: "NET WT 1.86 0Z (52.7g)" });

    const result = await new HttpOcrProvider().extractProductName(new Blob(["photo"]));

    expect(result).toEqual({ text: "SNICKERS BAR", netWeightText: "NET WT 1.86 0Z (52.7g)" });
  });

  it("preserves a null net weight when the front panel prints none", async () => {
    stubFetchJson({ text: "OLYMPUS Greek", net_weight_text: null });

    const result = await new HttpOcrProvider().extractProductName(new Blob(["photo"]));

    expect(result).toEqual({ text: "OLYMPUS Greek", netWeightText: null });
  });
});

describe("HttpOcrProvider.extractNutritionTable — EU labels", () => {
  it("maps ocr-service's snake_case fields to the app's camelCase shape", async () => {
    stubFetchJson({
      format: "eu",
      per_100g: GOLDEN_RAW_VALUES,
      per_serving: null,
      serving_size_text: null,
      serving_grams: null,
      flags: [],
    });

    const result = await new HttpOcrProvider().extractNutritionTable(new Blob(["photo"]));

    expect(result).toEqual({
      format: "eu",
      per100g: {
        energyKcal: 70, fatG: 2.0, saturatesG: 1.2, carbohydrateG: 4.0,
        sugarsG: 4.0, proteinG: 9.0, saltG: 0.18,
      },
      flags: [],
    });
  });

  it("preserves a null field instead of coercing or dropping it", async () => {
    stubFetchJson({
      format: "eu",
      per_100g: { ...GOLDEN_RAW_VALUES, energy_kcal: null },
      per_serving: null,
      serving_size_text: null,
      serving_grams: null,
      flags: ["energy_kcal"],
    });

    const result = await new HttpOcrProvider().extractNutritionTable(new Blob(["photo"]));

    expect(result.format).toBe("eu");
    expect(result).toMatchObject({ per100g: { energyKcal: null }, flags: ["energy_kcal"] });
  });
});

describe("HttpOcrProvider.validate", () => {
  it("posts snake_case values and returns flags", async () => {
    const fetchMock = stubFetchJson({ flags: ["fat_g"] });

    const result = await new HttpOcrProvider().validate(
      { energyKcal: 70, fatG: 2.0, saturatesG: 5.0, carbohydrateG: 4.0, sugarsG: 4.0, proteinG: 9.0, saltG: 0.18 },
      295,
    );

    expect(result.flags).toEqual(["fat_g"]);
    const [, requestInit] = fetchMock.mock.calls[0];
    expect(JSON.parse(requestInit.body as string)).toEqual({
      values: {
        energy_kcal: 70, fat_g: 2.0, saturates_g: 5.0, carbohydrate_g: 4.0,
        sugars_g: 4.0, protein_g: 9.0, salt_g: 0.18,
      },
      energy_kj: 295,
    });
  });
});

describe("HttpOcrProvider.extractNutritionTable — US labels", () => {
  it("returns per-serving values and a null serving weight without throwing", async () => {
    stubFetchJson({
      format: "us",
      per_100g: null,
      per_serving: {
        energy_kcal: 250, fat_g: 12, saturates_g: 4.5, carbohydrate_g: 32,
        sugars_g: 28, protein_g: 4, salt_g: 0.3125,
      },
      serving_size_text: "1 bas",
      serving_grams: null,
      servings_per_container: null,
      flags: [],
    });

    const result = await new HttpOcrProvider().extractNutritionTable(new Blob(["photo"]));

    expect(result).toEqual({
      format: "us",
      perServing: {
        energyKcal: 250, fatG: 12, saturatesG: 4.5, carbohydrateG: 32,
        sugarsG: 28, proteinG: 4, saltG: 0.3125,
      },
      servingSizeText: "1 bas",
      servingGrams: null,
      servingsPerContainer: null,
    });
  });

  it("carries a printed gram weight through", async () => {
    stubFetchJson({
      format: "us",
      per_100g: null,
      per_serving: {
        energy_kcal: 200, fat_g: 12, saturates_g: 4, carbohydrate_g: 23,
        sugars_g: 21, protein_g: 2, salt_g: 0.0375,
      },
      serving_size_text: "2 Tbsp (37g)",
      serving_grams: 37,
      servings_per_container: null,
      flags: [],
    });

    const result = await new HttpOcrProvider().extractNutritionTable(new Blob(["photo"]));

    expect(result.format).toBe("us");
    expect(result).toMatchObject({ servingGrams: 37, servingSizeText: "2 Tbsp (37g)" });
  });

  it("maps the servings-per-container count to camelCase", async () => {
    stubFetchJson({
      format: "us",
      per_100g: null,
      per_serving: {
        energy_kcal: 220, fat_g: 11, saturates_g: 4, carbohydrate_g: 29,
        sugars_g: 25, protein_g: 4, salt_g: 0.2875,
      },
      serving_size_text: "1 bar (47g)",
      serving_grams: 47,
      servings_per_container: 48,
      flags: [],
    });

    const result = await new HttpOcrProvider().extractNutritionTable(new Blob(["photo"]));

    expect(result).toMatchObject({ servingsPerContainer: 48 });
  });

  it("throws OcrServiceError for a 422, which now means only an unreadable label", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 422,
      json: () => Promise.resolve({ detail: "No per-100g header found" }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(new HttpOcrProvider().extractNutritionTable(new Blob(["photo"]))).rejects.toThrow(
      "OCR service request to /ocr/nutrition-table failed with status 422",
    );
  });
});
