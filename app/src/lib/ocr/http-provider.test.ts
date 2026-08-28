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
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve(body) }),
  );
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("HttpOcrProvider.extractNutritionTable", () => {
  it("maps ocr-service's snake_case fields to the app's camelCase shape", async () => {
    stubFetchJson({ values: GOLDEN_RAW_VALUES, flags: [] });

    const result = await new HttpOcrProvider().extractNutritionTable(new Blob(["photo"]));

    expect(result.values).toEqual({
      energyKcal: 70,
      fatG: 2.0,
      saturatesG: 1.2,
      carbohydrateG: 4.0,
      sugarsG: 4.0,
      proteinG: 9.0,
      saltG: 0.18,
    });
    expect(result.flags).toEqual([]);
  });

  it("preserves a null field instead of coercing or dropping it", async () => {
    stubFetchJson({
      values: { ...GOLDEN_RAW_VALUES, energy_kcal: null },
      flags: ["energy_kcal"],
    });

    const result = await new HttpOcrProvider().extractNutritionTable(new Blob(["photo"]));

    expect(result.values.energyKcal).toBeNull();
    expect(result.flags).toEqual(["energy_kcal"]);
  });
});
