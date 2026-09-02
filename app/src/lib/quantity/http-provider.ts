import { MAX_RESPONSE_TOKENS, omniRouteUrl, parseNumericResponse, postChatCompletion } from "@/lib/omniroute/client";

import type { QuantityProvider } from "./provider";

class QuantityEstimationError extends Error {
  constructor(cause: unknown) {
    super("Quantity estimation failed");
    this.name = "QuantityEstimationError";
    this.cause = cause;
  }
}

const buildRequestBody = (photo: Buffer): unknown => ({
  model: process.env.OMNIROUTE_MODEL ?? "auto",
  max_tokens: MAX_RESPONSE_TOKENS,
  messages: [
    {
      role: "user",
      content: [
        {
          type: "text",
          text: "Estimate the weight in grams of the food shown. Reply with only a number.",
        },
        {
          type: "image_url",
          image_url: { url: `data:image/jpeg;base64,${photo.toString("base64")}` },
        },
      ],
    },
  ],
});

export class HttpQuantityProvider implements QuantityProvider {
  async estimateGrams(photo: Buffer): Promise<number> {
    const url = omniRouteUrl();
    try {
      const body = await postChatCompletion(url, buildRequestBody(photo));
      return parseNumericResponse(body);
    } catch (error) {
      throw new QuantityEstimationError(error);
    }
  }
}
