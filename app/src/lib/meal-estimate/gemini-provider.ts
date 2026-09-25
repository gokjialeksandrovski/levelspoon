import {
  firstChoice,
  geminiApiKey,
  geminiModel,
  imagePart,
  postChatCompletion,
  type GeminiResponse,
} from "@/lib/gemini/client";

import type { MealEstimateProvider } from "./provider";

// Measured 2026-09-25: 5 live text-only calls (gemini-3.5-flash-lite, no
// photo calls measured), completion_tokens 280-547, max 547 on a 5-item
// caesar salad. 2200 is ~4x that max - the quantity provider's 16x headroom
// is sized for a 4-token answer, 4x is enough here for hundreds of tokens.
const MAX_RESPONSE_TOKENS = 2200;

const PROMPT = [
  "You estimate what a person ate from their description and optional photo.",
  "Split the meal into separate components (each food, oil, sauce, drink).",
  "For each give an estimated eaten weight in grams and nutrition per 100 g:",
  "kcal, fat, saturated fat, carbohydrate, sugars, protein, salt, fibre (null if unknown).",
  "If nothing describes food, return an empty items list.",
].join(" ");

const NUTRITION_PROPERTIES = Object.fromEntries(
  ["energyKcal", "fatG", "saturatesG", "carbohydrateG", "sugarsG", "proteinG", "saltG"].map((key) => [key, { type: "number" }]),
);

const RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    mealName: { type: "string" },
    items: {
      type: "array",
      items: {
        type: "object",
        properties: {
          name: { type: "string" },
          grams: { type: "number" },
          per100g: {
            type: "object",
            properties: { ...NUTRITION_PROPERTIES, fibreG: { type: ["number", "null"] } },
            required: [...Object.keys(NUTRITION_PROPERTIES), "fibreG"],
          },
        },
        required: ["name", "grams", "per100g"],
      },
    },
  },
  required: ["mealName", "items"],
};

class MealEstimationError extends Error {
  constructor(cause: unknown) {
    super("Meal estimation failed");
    this.name = "MealEstimationError";
    this.cause = cause;
  }
}

const userContent = (description: string, photo: Buffer | null) => {
  const text = { type: "text" as const, text: `${PROMPT}\n\nDescription: ${description || "(none - use the photo)"}` };
  return photo ? [text, imagePart(photo)] : [text];
};

const parseReply = (body: GeminiResponse): unknown => {
  const choice = firstChoice(body, MAX_RESPONSE_TOKENS);
  return JSON.parse(choice?.message?.content ?? "");
};

export class GeminiMealEstimateProvider implements MealEstimateProvider {
  async estimate(description: string, photo: Buffer | null): Promise<unknown> {
    // Outside the try, same as the quantity provider: a missing key or an
    // unreadable photo format must reach the caller as itself.
    const apiKey = geminiApiKey();
    const content = userContent(description, photo);
    try {
      const body = await postChatCompletion(apiKey, {
        model: geminiModel(),
        max_tokens: MAX_RESPONSE_TOKENS,
        response_format: { type: "json_schema", json_schema: { name: "meal_estimate", schema: RESPONSE_SCHEMA } },
        messages: [{ role: "user", content }],
      });
      return parseReply(body);
    } catch (error) {
      throw new MealEstimationError(error);
    }
  }
}
