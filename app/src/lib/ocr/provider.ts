import type { NutritionValues } from "@/actions/products";

export type NullableNutritionValues = {
  [K in keyof NutritionValues]: number | null;
};

/**
 * One nutrition label as ocr-service read it.
 *
 * An EU label is already per-100g. A US label reports per-serving figures plus
 * its serving line as printed; `servingGrams` is non-null only when the label
 * actually printed a weight, and resolving the rest is the app's job.
 */
export type NutritionTableRead =
  | { format: "eu"; per100g: NullableNutritionValues; flags: string[] }
  | {
      format: "us";
      perServing: NutritionValues;
      servingSizeText: string;
      servingGrams: number | null;
    };

export interface OcrProvider {
  extractProductName(photo: Blob): Promise<{ text: string }>;
  extractNutritionTable(photo: Blob): Promise<NutritionTableRead>;
  validate(values: NutritionValues, energyKj?: number): Promise<{ flags: string[] }>;
}
