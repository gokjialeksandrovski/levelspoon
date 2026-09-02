import { MAX_RESPONSE_TOKENS, omniRouteUrl, parseNumericResponse, postChatCompletion } from "@/lib/omniroute/client";

import type { ServingSizeProvider } from "./provider";

class ServingSizeEstimationError extends Error {
  constructor(cause: unknown) {
    super("Serving size estimation failed");
    this.name = "ServingSizeEstimationError";
    this.cause = cause;
  }
}

const buildRequestBody = (measureText: string, productName: string): unknown => ({
  model: process.env.OMNIROUTE_MODEL ?? "auto",
  max_tokens: MAX_RESPONSE_TOKENS,
  messages: [
    {
      role: "user",
      content: `Convert this serving size to grams: "${measureText}" of "${productName}". Reply with only a number.`,
    },
  ],
});

export class HttpServingSizeProvider implements ServingSizeProvider {
  async convertToGrams(measureText: string, productName: string): Promise<number> {
    const url = omniRouteUrl();
    try {
      const body = await postChatCompletion(url, buildRequestBody(measureText, productName));
      return parseNumericResponse(body);
    } catch (error) {
      throw new ServingSizeEstimationError(error);
    }
  }
}
