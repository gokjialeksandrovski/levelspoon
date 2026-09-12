import type { NutritionValues } from "@/actions/products";

import type { NullableNutritionValues, NutritionTableRead, OcrProvider } from "./provider";

const MOCK_NUTRITION: NullableNutritionValues = {
  energyKcal: 70,
  fatG: 2.0,
  saturatesG: 1.2,
  carbohydrateG: 4.0,
  sugarsG: 4.0,
  proteinG: 9.0,
  saltG: 0.18,
};

const PRODUCT_NAME_BY_MARKER: Record<string, string> = {
  confident: "Olympus Greek Yogurt 2% Fat",
  ambiguous: "Olympus Greek Yogurt Fat",
  "no-match": "Completely Unrelated Product Name Zzz",
};
const DEFAULT_PRODUCT_NAME = "Olympus Greek Yogurt 2% Fat";

const DEFAULT_NUTRITION_TABLE: NutritionTableRead = { format: "eu", per100g: MOCK_NUTRITION, flags: [] };

// A household-measure US label with no printed gram weight and no bracket
// weight either - the Nutella-shaped case (spec 2026-09-12-per-unit-
// nutrition-basis-design.md §1/§5). "2 Tablespoon" parses to a recognized
// but unconvertible volume unit, so the capture pipeline builds a per-unit
// product straight from this instead of asking a question with no answer.
const PER_UNIT_NUTRITION_MARKER = "per-unit";

const PER_UNIT_NUTRITION_TABLE: NutritionTableRead = {
  format: "us",
  perServing: {
    energyKcal: 190,
    fatG: 16,
    saturatesG: 3.5,
    carbohydrateG: 20,
    sugarsG: 20,
    proteinG: 2,
    saltG: 0.04,
  },
  servingSizeText: "2 Tablespoon",
  servingGrams: null,
  servingsPerContainer: null,
};

export class MockOcrProvider implements OcrProvider {
  async extractProductName(photo: Blob): Promise<{ text: string; netWeightText: string | null }> {
    const marker = (await photo.text()).trim();
    return { text: PRODUCT_NAME_BY_MARKER[marker] ?? DEFAULT_PRODUCT_NAME, netWeightText: null };
  }

  async extractNutritionTable(photo: Blob): Promise<NutritionTableRead> {
    const marker = (await photo.text()).trim();
    return marker === PER_UNIT_NUTRITION_MARKER ? PER_UNIT_NUTRITION_TABLE : DEFAULT_NUTRITION_TABLE;
  }

  async validate(values: NutritionValues): Promise<{ flags: string[] }> {
    const flags = new Set<string>();
    if (values.saturatesG > values.fatG) {
      flags.add("saturates_g");
      flags.add("fat_g");
    }
    if (values.sugarsG > values.carbohydrateG) {
      flags.add("sugars_g");
      flags.add("carbohydrate_g");
    }
    return { flags: [...flags].sort() };
  }
}
