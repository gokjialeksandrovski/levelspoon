import {
  geminiApiKey,
  geminiModel,
  imagePart,
  postChatCompletion,
  TruncatedResponseError,
  type GeminiResponse,
} from "@/lib/gemini/client";

import type { QuantityProvider } from "./provider";

// Flash-Lite answers this prompt in 2-4 output tokens with 0 reasoning
// tokens (measured over 10 live calls, 2026-09-03). 64 leaves ~16x headroom
// while still bounding a model that unexpectedly reasons - which surfaces as
// TruncatedResponseError rather than being parsed as an empty reply.
const MAX_RESPONSE_TOKENS = 64;

const ESTIMATE_PROMPT =
  "Estimate the weight in grams of the food shown. Reply with only a number.";

class NonNumericResponseError extends Error {
  constructor(content: string) {
    super(`Gemini returned a non-numeric response: ${content}`);
    this.name = "NonNumericResponseError";
  }
}

class QuantityEstimationError extends Error {
  constructor(cause: unknown) {
    super("Quantity estimation failed");
    this.name = "QuantityEstimationError";
    this.cause = cause;
  }
}

const parseGramsResponse = (body: GeminiResponse): number => {
  const choice = body.choices?.[0];
  if (choice?.finish_reason === "length") {
    throw new TruncatedResponseError(MAX_RESPONSE_TOKENS);
  }
  const content = choice?.message?.content ?? "";
  const grams = Number.parseFloat(content);
  if (!Number.isFinite(grams) || grams <= 0) {
    throw new NonNumericResponseError(content);
  }
  return grams;
};

export class GeminiQuantityProvider implements QuantityProvider {
  async estimateGrams(photo: Buffer): Promise<number> {
    // Both guards run before the try block, so misconfiguration or bad input
    // propagates unwrapped instead of flattening into QuantityEstimationError.
    const apiKey = geminiApiKey();
    const image = imagePart(photo);
    try {
      const body = await postChatCompletion(apiKey, {
        model: geminiModel(),
        max_tokens: MAX_RESPONSE_TOKENS,
        messages: [{ role: "user", content: [{ type: "text", text: ESTIMATE_PROMPT }, image] }],
      });
      return parseGramsResponse(body);
    } catch (error) {
      throw new QuantityEstimationError(error);
    }
  }
}
