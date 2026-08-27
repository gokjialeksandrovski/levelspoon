import type { QuantityProvider } from "./provider";

class MissingApiKeyError extends Error {
  constructor() {
    super("GEMINI_API_KEY is required when QUANTITY_PROVIDER is not 'mock'");
    this.name = "MissingApiKeyError";
  }
}

class QuantityEstimationError extends Error {
  constructor(cause: unknown) {
    super("Gemini quantity estimation failed");
    this.name = "QuantityEstimationError";
    this.cause = cause;
  }
}

const GEMINI_MODEL = "gemini-flash-lite-latest";

export class GeminiQuantityProvider implements QuantityProvider {
  private readonly apiKey: string;

  constructor() {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new MissingApiKeyError();
    }
    this.apiKey = apiKey;
  }

  async estimateGrams(photo: Buffer): Promise<number> {
    try {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${this.apiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [
              {
                parts: [
                  { text: "Estimate the weight in grams of the food shown. Reply with only a number." },
                  { inlineData: { mimeType: "image/jpeg", data: photo.toString("base64") } },
                ],
              },
            ],
          }),
        },
      );
      const body = await response.json();
      const text = body.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
      const grams = Number.parseFloat(text);
      if (Number.isNaN(grams)) {
        throw new Error(`Gemini returned a non-numeric response: ${text}`);
      }
      return grams;
    } catch (error) {
      throw new QuantityEstimationError(error);
    }
  }
}
