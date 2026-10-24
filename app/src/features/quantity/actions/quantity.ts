"use server";

import { requireAccountUserId } from "@/lib/auth/require-user";
import { geminiFailureKind, type GeminiFailureKind } from "@/lib/gemini/client";
import { GeminiQuantityProvider } from "@/lib/quantity/gemini-provider";
import { MockQuantityProvider } from "@/lib/quantity/mock-provider";
import type { GramsEstimate, QuantityProvider } from "@/lib/quantity/provider";

export type EstimateQuantityResult = GramsEstimate | { kind: GeminiFailureKind };

// The name only tells the model which food to weigh, so a cut name still
// does its job; the cap bounds what one crafted call can put in the prompt.
const FOOD_NAME_MAX_LENGTH = 200;

const getProvider = (): QuantityProvider => {
  return process.env.QUANTITY_PROVIDER === "mock"
    ? new MockQuantityProvider()
    : new GeminiQuantityProvider();
};

/** Gemini's first job (CLAUDE.md, "AI usage boundary"): grams of the named
 * food from an amount photo. Every failure comes back as a result kind, so
 * the amount step can say whether another photo, a retry or neither helps. */
export const estimateQuantity = async (photo: Blob, foodName: string): Promise<EstimateQuantityResult> => {
  await requireAccountUserId();
  const buffer = Buffer.from(await photo.arrayBuffer());
  try {
    return await getProvider().estimateGrams(buffer, foodName.trim().slice(0, FOOD_NAME_MAX_LENGTH));
  } catch (error) {
    console.error("estimateQuantity failed", error);
    return { kind: geminiFailureKind(error) };
  }
};
