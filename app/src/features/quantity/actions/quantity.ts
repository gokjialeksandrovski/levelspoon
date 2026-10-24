"use server";

import { requireAccountUserId } from "@/lib/auth/require-user";
import { geminiFailureKind, type GeminiFailureKind } from "@/lib/gemini/client";
import { GeminiQuantityProvider } from "@/lib/quantity/gemini-provider";
import { MockQuantityProvider } from "@/lib/quantity/mock-provider";
import type { GramsEstimate, QuantityProvider } from "@/lib/quantity/provider";

export type EstimateQuantityResult = GramsEstimate | { kind: GeminiFailureKind };

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
    return await getProvider().estimateGrams(buffer, foodName.trim());
  } catch (error) {
    console.error("estimateQuantity failed", error);
    return { kind: geminiFailureKind(error) };
  }
};
