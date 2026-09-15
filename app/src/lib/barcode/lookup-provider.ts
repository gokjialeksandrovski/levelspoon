import type { NutritionValues } from "@/types/nutrition";

export interface ExternalBarcodeMatch {
  nameGuess: string;
  nutritionPer100g: NutritionValues;
  nutritionBasisUnit: string;
  netWeightText: string | null;
}

export type ExternalLookupResult =
  | { kind: "found"; match: ExternalBarcodeMatch }
  | { kind: "not_found" };

export interface BarcodeLookupProvider {
  lookup(barcode: string): Promise<ExternalLookupResult>;
}
