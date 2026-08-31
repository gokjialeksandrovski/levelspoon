import type { QuantityProvider } from "./provider";

class GatewayError extends Error {
  constructor(status: number) {
    super(`OmniRoute gateway request failed with status ${status}`);
    this.name = "GatewayError";
  }
}

class QuantityEstimationError extends Error {
  constructor(cause: unknown) {
    super("Quantity estimation failed");
    this.name = "QuantityEstimationError";
    this.cause = cause;
  }
}

const omniRouteUrl = (): string => {
  const url = process.env.OMNIROUTE_URL;
  if (!url) {
    throw new Error("Missing required environment variable: OMNIROUTE_URL");
  }
  return url;
};

const buildRequestBody = (photo: Buffer): unknown => ({
  model: process.env.OMNIROUTE_MODEL ?? "auto",
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

interface OmniRouteResponse {
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
}

const parseGrams = (body: OmniRouteResponse): number => {
  const text = body.choices?.[0]?.message?.content ?? "";
  const grams = Number.parseFloat(text);
  if (Number.isNaN(grams)) {
    throw new Error(`OmniRoute gateway returned a non-numeric response: ${text}`);
  }
  return grams;
};

export class HttpQuantityProvider implements QuantityProvider {
  async estimateGrams(photo: Buffer): Promise<number> {
    const url = omniRouteUrl();
    try {
      const response = await fetch(`${url}/v1/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildRequestBody(photo)),
      });
      if (!response.ok) {
        throw new GatewayError(response.status);
      }
      const body = await response.json();
      return parseGrams(body);
    } catch (error) {
      throw new QuantityEstimationError(error);
    }
  }
}
