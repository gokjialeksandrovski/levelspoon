import {
  firstChoice,
  geminiApiKey,
  geminiModel,
  imagePart,
  postChatCompletion,
  type GeminiResponse,
} from "@/lib/gemini/client";

import type { GramsEstimate, QuantityProvider } from "./provider";

// "medium": AI is BYOK, so the user's key carries the cost. Measured
// 2026-10-24 on a caesar salad photo: 4.5-4.7 s, same as the default minimal,
// which thinks not at all here; high took 5.7-7.0 s for one number.
const REASONING_EFFORT = "medium";

// Thinking counts toward max_tokens (usage reports it only in total_tokens).
// Same measurement at medium: thinking + answer 178-298 tokens. Thinking
// length varies per photo, so ~7x that.
const MAX_RESPONSE_TOKENS = 2000;

// Judgment, same ceiling as lazy track's MAX_ITEM_GRAMS: past 5 kg a photo
// estimate is a misread, not a portion.
const MAX_ESTIMATE_GRAMS = 5000;

// The name tells the model which food to weigh: on a plate of several, a
// photo alone gets the whole plate weighed. The name goes in, only grams come
// out, so this stays Gemini's first job (CLAUDE.md, "AI usage boundary").
const estimatePrompt = (foodName: string): string =>
  [
    "Estimate the weight in grams of the named food in the photo.",
    "Weigh only that food, as it is shown, and only the part that is eaten: leave out the plate, bowl, container, packaging, bones, shells and peel.",
    "Ignore any other food in the photo.",
    "Judge size against what else is visible: a dinner plate is about 26 cm across; cutlery, hands and packaging help too.",
    "If the named food is not visible or its amount cannot be judged, give 0.",
    `Food: ${foodName}`,
  ].join(" ");

// A JSON number, not free text: a reply of "1,250" read with parseFloat is 1 g.
const RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    grams: { type: "number", description: "Weight in grams of the named food as shown, or 0 if it cannot be judged." },
  },
  required: ["grams"],
};

class InvalidGramsReplyError extends Error {
  constructor(content: string) {
    super(`Gemini returned no usable gram figure: ${content}`);
    this.name = "InvalidGramsReplyError";
  }
}

class QuantityEstimationError extends Error {
  constructor(cause: unknown) {
    super("Quantity estimation failed");
    this.name = "QuantityEstimationError";
    this.cause = cause;
  }
}

const readGrams = (content: string): number => {
  const reply: unknown = JSON.parse(content);
  const grams = typeof reply === "object" && reply !== null && "grams" in reply ? reply.grams : undefined;
  if (typeof grams !== "number" || !Number.isFinite(grams) || grams < 0) {
    throw new InvalidGramsReplyError(content);
  }
  return grams;
};

const parseGramsResponse = (body: GeminiResponse): GramsEstimate => {
  const choice = firstChoice(body, MAX_RESPONSE_TOKENS);
  const grams = readGrams(choice?.message?.content ?? "");
  return grams > 0 && grams <= MAX_ESTIMATE_GRAMS ? { kind: "estimated", grams } : { kind: "no_estimate" };
};

export class GeminiQuantityProvider implements QuantityProvider {
  async estimateGrams(photo: Buffer, foodName: string): Promise<GramsEstimate> {
    // Both guards run before the try block, so misconfiguration or bad input
    // propagates unwrapped instead of flattening into QuantityEstimationError.
    const apiKey = geminiApiKey();
    const image = imagePart(photo);
    try {
      const body = await postChatCompletion(apiKey, {
        model: geminiModel(),
        max_tokens: MAX_RESPONSE_TOKENS,
        reasoning_effort: REASONING_EFFORT,
        response_format: { type: "json_schema", json_schema: { name: "amount_estimate", schema: RESPONSE_SCHEMA } },
        messages: [{ role: "user", content: [{ type: "text", text: estimatePrompt(foodName) }, image] }],
      });
      return parseGramsResponse(body);
    } catch (error) {
      throw new QuantityEstimationError(error);
    }
  }
}
