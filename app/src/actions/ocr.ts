"use server";

import type { NutritionValues } from "@/actions/products";
import { convertServingSize } from "@/actions/serving-size";
import { requireUserId } from "@/lib/auth/require-user";
import { scalePerServingToPer100g } from "@/lib/nutrition/scale-per-serving";
import { HttpOcrProvider, ServingGramsUnavailableError } from "@/lib/ocr/http-provider";
import { MockOcrProvider } from "@/lib/ocr/mock-provider";
import type { NullableNutritionValues, OcrProvider } from "@/lib/ocr/provider";

const getProvider = (): OcrProvider =>
  process.env.OCR_PROVIDER === "mock" ? new MockOcrProvider() : new HttpOcrProvider();

export const ocrProductName = async (photo: Blob): Promise<{ text: string }> => {
  await requireUserId();
  return getProvider().extractProductName(photo);
};

export const ocrNutritionTable = async (
  photo: Blob,
  productNameGuess: string,
): Promise<{ values: NullableNutritionValues; flags: string[] }> => {
  await requireUserId();
  try {
    return await getProvider().extractNutritionTable(photo);
  } catch (error) {
    if (!(error instanceof ServingGramsUnavailableError)) {
      throw error;
    }
    const { grams } = await convertServingSize(error.servingSizeText, productNameGuess);
    const values = scalePerServingToPer100g(error.perServingValues, grams);
    const { flags } = await getProvider().validate(values);
    return { values, flags };
  }
};

export const validateNutrition = async (
  values: NutritionValues,
  energyKj?: number,
): Promise<{ flags: string[] }> => {
  await requireUserId();
  return getProvider().validate(values, energyKj);
};
