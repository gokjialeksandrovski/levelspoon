import { afterEach, describe, expect, it, vi } from "vitest";

import { OpenFoodFactsProvider } from "./open-food-facts-provider";

const stubFetchJson = (status: number, body: unknown) => {
  const fetchMock = vi.fn().mockResolvedValue({ ok: status < 300, status, json: () => Promise.resolve(body) });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("OpenFoodFactsProvider.lookup", () => {
  it("maps a found product's per-100g nutriments and sends a User-Agent header", async () => {
    const fetchMock = stubFetchJson(200, {
      status: 1,
      product: {
        product_name: "Test Cereal",
        quantity: "375 g",
        product_quantity_unit: "g",
        nutriments: {
          "energy-kcal_100g": 380, fat_100g: 5, "saturated-fat_100g": 1,
          carbohydrates_100g: 70, sugars_100g: 20, proteins_100g: 8, salt_100g: 1.1,
        },
      },
    });

    const result = await new OpenFoodFactsProvider().lookup("5901234123457");

    expect(result).toEqual({
      kind: "found",
      match: {
        nameGuess: "Test Cereal",
        nutritionPer100g: {
          energyKcal: 380, fatG: 5, saturatesG: 1, carbohydrateG: 70,
          sugarsG: 20, proteinG: 8, saltG: 1.1,
        },
        nutritionBasisUnit: "g",
        netWeightText: "375 g",
      },
    });
    const [, requestInit] = fetchMock.mock.calls[0];
    expect((requestInit.headers as Record<string, string>)["User-Agent"]).toMatch(/^per100\//);
  });

  it("maps a liquid's serving_quantity_unit to a ml basis unit when product_quantity_unit is absent", async () => {
    stubFetchJson(200, {
      status: 1,
      product: {
        product_name: "Test Juice",
        quantity: "1 L",
        serving_quantity_unit: "ml",
        nutriments: { "energy-kcal_100g": 45 },
      },
    });

    const result = await new OpenFoodFactsProvider().lookup("4000000000006");

    expect(result.kind).toBe("found");
    if (result.kind === "found") {
      expect(result.match.nutritionBasisUnit).toBe("ml");
    }
  });

  it("maps a real-shaped liquid product (no nutrition_data_per field) to ml via product_quantity_unit", async () => {
    stubFetchJson(200, {
      status: 1,
      product: {
        product_name: "Coca-Cola",
        quantity: "330 ml",
        product_quantity_unit: "ml",
        nutriments: { "energy-kcal_100g": 42 },
      },
    });

    const result = await new OpenFoodFactsProvider().lookup("5449000000996");

    expect(result.kind).toBe("found");
    if (result.kind === "found") {
      expect(result.match.nutritionBasisUnit).toBe("ml");
    }
  });

  it("defaults to a g basis when neither quantity-unit field is present", async () => {
    stubFetchJson(200, { status: 1, product: { product_name: "Unitless", nutriments: {} } });

    const result = await new OpenFoodFactsProvider().lookup("4000000000006");

    expect(result.kind).toBe("found");
    if (result.kind === "found") {
      expect(result.match.nutritionBasisUnit).toBe("g");
    }
  });

  it("defaults a missing nutrient field to 0 instead of throwing", async () => {
    stubFetchJson(200, { status: 1, product: { product_name: "Sparse", nutriments: {} } });

    const result = await new OpenFoodFactsProvider().lookup("4000000000006");

    expect(result.kind).toBe("found");
    if (result.kind === "found") {
      expect(result.match.nutritionPer100g.energyKcal).toBe(0);
    }
  });

  it("treats a 404 as not_found", async () => {
    stubFetchJson(404, { status: 0 });

    const result = await new OpenFoodFactsProvider().lookup("4000000000006");

    expect(result).toEqual({ kind: "not_found" });
  });

  it("treats a 429 (rate limit) as not_found, never blocking the user", async () => {
    stubFetchJson(429, {});

    const result = await new OpenFoodFactsProvider().lookup("4000000000006");

    expect(result).toEqual({ kind: "not_found" });
  });

  it("throws for an unexpected server error instead of silently degrading", async () => {
    stubFetchJson(500, {});

    await expect(new OpenFoodFactsProvider().lookup("4000000000006")).rejects.toThrow(/status 500/);
  });
});
