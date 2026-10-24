import {
  firstChoice,
  geminiApiKey,
  geminiModel,
  imagePart,
  postChatCompletion,
  type GeminiResponse,
} from "@/lib/gemini/client";

import type { MealEstimateProvider } from "./provider";

// "high", the most this model offers: AI is BYOK, so the user's key carries
// the cost. Measured 2026-10-24 over 3 meals: high split a takeaway burrito
// into tortilla, chicken, rice, beans and cheese where minimal and low gave one
// "Chicken burrito" row; 8.8-10.2 s against 5.1-5.6 s at the default minimal.
const REASONING_EFFORT = "high";

// Thinking counts toward max_tokens (usage reports it only in total_tokens).
// Same measurement at high: thinking + answer 1996-2791 tokens, the most on a
// caesar salad photo. 12000 is ~4x that.
const MAX_RESPONSE_TOKENS = 12_000;

// The same-state line guards the costliest slip: cooked-rice grams times
// dry-rice figures is about 2.5-3x the kcal.
const PROMPT = [
  "You estimate what a person ate from their description and optional photo.",
  "Split the meal into separate components (each food, oil, sauce, drink).",
  "For each give an estimated eaten weight in grams and nutrition per 100 g:",
  "kcal, fat, saturated fat, carbohydrate (excluding fibre), sugars, protein, salt, dietary fibre, alcohol.",
  "Weight and per-100 g figures describe the food in the same state, as eaten: cooked rice is weighed and counted as cooked rice, never as dry rice.",
  "Use any amount the description states, converted to grams; estimate only what it leaves out.",
  "Every figure except kcal is in grams: salt is salt, not sodium, and never milligrams.",
  "In a photo, judge portions against the plate (a dinner plate is about 26 cm across), cutlery and hands.",
  "If nothing describes food, return an empty items list.",
].join(" ");

const FIGURE = { type: "number" };

// Fibre required like the rest: every figure here is a guess anyway, and a
// nullable fibre let the model skip it on every item. The label path's
// "unknown" meaning does not apply to an estimate.
const NUTRITION_PROPERTIES = {
  energyKcal: FIGURE,
  fatG: FIGURE,
  saturatesG: FIGURE,
  carbohydrateG: FIGURE,
  sugarsG: FIGURE,
  proteinG: FIGURE,
  saltG: { type: "number", description: "Salt in grams per 100 g. Not sodium, not milligrams." },
  fibreG: FIGURE,
  alcoholG: { type: "number", description: "Alcohol in grams per 100 g, 0 for food and alcohol-free drinks." },
};

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
          grams: { type: "number", description: "Eaten weight in grams, in the same state as per100g." },
          per100g: {
            type: "object",
            description: "Nutrition per 100 g of this food as eaten.",
            properties: NUTRITION_PROPERTIES,
            required: Object.keys(NUTRITION_PROPERTIES),
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
        reasoning_effort: REASONING_EFFORT,
        response_format: { type: "json_schema", json_schema: { name: "meal_estimate", schema: RESPONSE_SCHEMA } },
        messages: [{ role: "user", content }],
      });
      return parseReply(body);
    } catch (error) {
      throw new MealEstimationError(error);
    }
  }
}
