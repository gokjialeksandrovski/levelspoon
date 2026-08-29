import type { NutritionValues } from "@/actions/products";

export type NullableNutritionValues = {
  [K in keyof NutritionValues]: number | null;
};

export interface OcrProvider {
  extractProductName(photo: Blob): Promise<{ text: string }>;
  extractNutritionTable(photo: Blob): Promise<{ values: NullableNutritionValues; flags: string[] }>;
  validate(values: NutritionValues, energyKj?: number): Promise<{ flags: string[] }>;
}
