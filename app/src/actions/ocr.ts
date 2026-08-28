"use server";

import { requireUserId } from "@/lib/auth/require-user";
import { HttpOcrProvider } from "@/lib/ocr/http-provider";
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
): Promise<{ values: NullableNutritionValues; flags: string[] }> => {
  await requireUserId();
  return getProvider().extractNutritionTable(photo);
};
