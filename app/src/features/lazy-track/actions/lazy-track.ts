"use server";

import { requireUserId } from "@/lib/auth/require-user";
import { db } from "@/lib/db";
import { UnsupportedImageFormatError } from "@/lib/gemini/image-mime-type";
import { GeminiMealEstimateProvider } from "@/lib/meal-estimate/gemini-provider";
import { MockMealEstimateProvider } from "@/lib/meal-estimate/mock-provider";
import type { MealEstimateProvider } from "@/lib/meal-estimate/provider";
import {
  appendItemsToMeal,
  fetchOwnedMeal,
  insertRecipe,
  replaceRecipeItems,
  setMealRecipe,
  type AmountRow,
} from "@/features/recipes/actions/recipes.store";
import { isValidRecipeName } from "@/features/recipes/actions/recipes.utils";

import { insertAiProducts } from "./lazy-track.store";
import { canEstimate, parseMealEstimate, quantitySourceFor, type LoggedItem, type MealEstimateView } from "./lazy-track.utils";

export type EstimateMealResult =
  | { kind: "estimated"; estimate: MealEstimateView }
  | { kind: "nothing_found" }
  | { kind: "photo_unreadable" }
  | { kind: "unavailable" };

export type LogLazyMealResult =
  | { kind: "logged" }
  | { kind: "invalid_items" }
  | { kind: "invalid_recipe_name" }
  | { kind: "meal_missing" };

const getProvider = (): MealEstimateProvider =>
  process.env.MEAL_ESTIMATE_PROVIDER === "mock" ? new MockMealEstimateProvider() : new GeminiMealEstimateProvider();

const toBuffer = async (photo: Blob | null): Promise<Buffer | null> => (photo ? Buffer.from(await photo.arrayBuffer()) : null);

/** The second of Gemini's two jobs (CLAUDE.md, "AI usage boundary"). Nothing
 * is written here: the estimate goes back to the review screen, and only
 * logLazyMeal writes. */
export const estimateMeal = async (description: string, photo: Blob | null): Promise<EstimateMealResult> => {
  await requireUserId();
  if (!canEstimate(description, photo !== null)) {
    return { kind: "nothing_found" };
  }
  try {
    const raw = await getProvider().estimate(description.trim(), await toBuffer(photo));
    const estimate = parseMealEstimate(raw);
    return estimate.items.length === 0 ? { kind: "nothing_found" } : { kind: "estimated", estimate };
  } catch (error) {
    if (error instanceof UnsupportedImageFormatError) {
      return { kind: "photo_unreadable" };
    }
    console.error("estimateMeal failed", error);
    return { kind: "unavailable" };
  }
};

const toAmountRow = (productId: string, item: LoggedItem): AmountRow => ({
  productId,
  quantity: item.grams,
  quantityUnit: "g",
  entryCount: item.grams,
  entryUnit: "g",
  quantitySource: quantitySourceFor(item.gramsEdited),
});

/**
 * Files the reviewed estimate. Figures came back through the browser, so the
 * same bounds run again here; tampering could only ever touch this user's own
 * private rows, but a refused write is still cheaper than a nonsense one.
 */
export const logLazyMeal = async (mealId: string, items: LoggedItem[], recipeName: string | null): Promise<LogLazyMealResult> => {
  const userId = await requireUserId();
  // Re-parsed, not just re-bounded: a browser can send a string where a number
  // belongs, which isPlausibleItem's types alone would not catch at runtime.
  if (items.length === 0 || parseMealEstimate({ items }).items.length !== items.length) return { kind: "invalid_items" };
  if (recipeName !== null && !isValidRecipeName(recipeName)) return { kind: "invalid_recipe_name" };
  // Generic for a missing meal and another user's alike, same as saveMealAsRecipe.
  if (!(await fetchOwnedMeal(userId, mealId))) return { kind: "meal_missing" };

  await db.transaction(async (tx) => {
    const productIds = await insertAiProducts(tx, userId, items);
    const rows = items.map((item, index) => toAmountRow(productIds[index], item));
    await appendItemsToMeal(tx, mealId, rows);
    if (recipeName !== null) {
      const recipeId = await insertRecipe(tx, userId, recipeName);
      await replaceRecipeItems(tx, recipeId, rows);
      await setMealRecipe(tx, mealId, recipeId);
    }
  });
  return { kind: "logged" };
};
