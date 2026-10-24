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

/**
 * ocr-service could not decode the upload as an image: HEIC from a browser that
 * cannot convert it, or a corrupt file. Told apart from a label OCR could not
 * read, because a sharper shot of the same label fails the same way.
 */
export interface UnreadablePhoto {
  kind: "unreadable-photo";
}

export const UNREADABLE_PHOTO: UnreadablePhoto = { kind: "unreadable-photo" };

export const isUnreadablePhoto = (value: object): value is UnreadablePhoto =>
  "kind" in value && value.kind === UNREADABLE_PHOTO.kind;

export interface OcrProvider {
  extractProductName(photo: Blob): Promise<{ text: string; netWeightText: string | null } | UnreadablePhoto>;
  extractNutritionTable(photo: Blob): Promise<NutritionTableRead | UnreadablePhoto>;
  validate(values: NutritionValues, energyKj?: number): Promise<{ flags: string[] }>;
}
