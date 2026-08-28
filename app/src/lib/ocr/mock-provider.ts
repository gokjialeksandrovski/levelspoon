import type { NullableNutritionValues, OcrProvider } from "./provider";

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

  async extractNutritionTable(
    _photo: Blob,
  ): Promise<{ values: NullableNutritionValues; flags: string[] }> {
    return { values: MOCK_NUTRITION, flags: [] };
  }
}
