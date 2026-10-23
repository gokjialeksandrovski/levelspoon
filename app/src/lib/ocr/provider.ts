import type { NutritionValues } from "@/types/nutrition";

export type NullableNutritionValues = {
  [K in keyof NutritionValues]: number | null;
};

/**
 * One nutrition label as ocr-service read it.
 *
 * An EU label is already per 100 of `basisUnit` ("g", or "ml" for a drink). A US label reports per-serving figures plus
 * its serving line as printed; `servingGrams` is non-null only when the label
 * actually printed a weight, and resolving the rest is the app's job.
 */
export type NutritionTableRead =
  | { format: "eu"; per100g: NullableNutritionValues; basisUnit: string; flags: string[] }
  | {
      format: "us";
      perServing: NutritionValues;
      servingSizeText: string;
      servingGrams: number | null;
      /** How many servings the label says the whole package holds, or null
       * when not printed - feeds a net-weight-derived prefill guess only,
       * never a value the per-serving scaling itself depends on. */
      servingsPerContainer: number | null;
    };

export interface OcrProvider {
  extractProductName(photo: Blob): Promise<{ text: string; netWeightText: string | null }>;
  extractNutritionTable(photo: Blob): Promise<NutritionTableRead>;
  validate(values: NutritionValues, energyKj?: number): Promise<{ flags: string[] }>;
}
