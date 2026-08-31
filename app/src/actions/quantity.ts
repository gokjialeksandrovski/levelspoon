"use server";

import { HttpQuantityProvider } from "@/lib/quantity/http-provider";
import { MockQuantityProvider } from "@/lib/quantity/mock-provider";
import type { QuantityProvider } from "@/lib/quantity/provider";

const getProvider = (): QuantityProvider => {
  return process.env.QUANTITY_PROVIDER === "mock"
    ? new MockQuantityProvider()
    : new HttpQuantityProvider();
};

export const estimateQuantity = async (photo: Blob): Promise<{ grams: number }> => {
  const provider = getProvider();
  const buffer = Buffer.from(await photo.arrayBuffer());
  const grams = await provider.estimateGrams(buffer);
  return { grams };
};
