"use server";

import { requireUserId } from "@/lib/auth/require-user";
import { HttpServingSizeProvider } from "@/lib/serving-size/http-provider";
import { MockServingSizeProvider } from "@/lib/serving-size/mock-provider";
import type { ServingSizeProvider } from "@/lib/serving-size/provider";

const getProvider = (): ServingSizeProvider =>
  process.env.SERVING_SIZE_PROVIDER === "mock"
    ? new MockServingSizeProvider()
    : new HttpServingSizeProvider();

export const convertServingSize = async (
  measureText: string,
  productName: string,
): Promise<{ grams: number }> => {
  await requireUserId();
  const grams = await getProvider().convertToGrams(measureText, productName);
  return { grams };
};
