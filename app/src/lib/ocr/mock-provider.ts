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

export class MockOcrProvider implements OcrProvider {
  async extractProductName(photo: Blob): Promise<{ text: string }> {
    const marker = (await photo.text()).trim();
    return { text: PRODUCT_NAME_BY_MARKER[marker] ?? DEFAULT_PRODUCT_NAME };
  }

  async extractNutritionTable(_photo: Blob): Promise<NutritionTableRead> {
    return { format: "eu", per100g: MOCK_NUTRITION, flags: [] };
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
