"use server";

import { requireUserId } from "@/lib/auth/require-user";
import { db } from "@/lib/db";
import { UnsupportedImageFormatError } from "@/lib/gemini/image-mime-type";
import { GeminiMealEstimateProvider } from "@/lib/meal-estimate/gemini-provider";
import { MockMealEstimateProvider } from "@/lib/meal-estimate/mock-provider";
import type { MealEstimateProvider } from "@/lib/meal-estimate/provider";
import { appendItemsToMeal, fetchOwnedMeal, type AmountRow } from "@/features/recipes/actions/recipes.store";

import { insertAiProducts, removeUntouchedEstimate } from "./lazy-track.store";
import { canEstimate, parseMealEstimate, type EstimatedItem, type MealEstimateView } from "./lazy-track.utils";

type EstimateFailure = { kind: "nothing_found" } | { kind: "photo_unreadable" } | { kind: "unavailable" };

export type EstimateMealResult = { kind: "logged" } | { kind: "meal_missing" } | EstimateFailure;

export type UndoMealEstimateResult = { kind: "undone" } | { kind: "meal_missing" };

const getProvider = (): MealEstimateProvider =>
  process.env.MEAL_ESTIMATE_PROVIDER === "mock" ? new MockMealEstimateProvider() : new GeminiMealEstimateProvider();

const toBuffer = async (photo: Blob | null): Promise<Buffer | null> => (photo ? Buffer.from(await photo.arrayBuffer()) : null);

const requestEstimate = async (description: string, photo: Blob | null): Promise<MealEstimateView | EstimateFailure> => {
  try {
    const estimate = parseMealEstimate(await getProvider().estimate(description.trim(), await toBuffer(photo)));
    return estimate.items.length === 0 ? { kind: "nothing_found" } : estimate;
  } catch (error) {
    if (error instanceof UnsupportedImageFormatError) {
      return { kind: "photo_unreadable" };
    }
    console.error("estimateMeal failed", error);
    return { kind: "unavailable" };
  }
};

const toAmountRow = (productId: string, item: EstimatedItem): AmountRow => ({
  productId,
  quantity: item.grams,
  quantityUnit: "g",
  entryCount: item.grams,
  entryUnit: "g",
  quantitySource: "ai_estimated",
});

/**
 * The second of Gemini's two jobs (CLAUDE.md, "AI usage boundary"). Logs the
 * guess straight into the meal - the meal page is where it gets checked, and
 * its Undo is the way back out. `replacing` swaps out the meal's untouched
 * guesses in the same transaction, so a failed re-estimate keeps the old one.
 * Figures never pass through the browser: they go from the parse to the DB.
 */
export const estimateMeal = async (mealId: string, description: string, photo: Blob | null, replacing: boolean): Promise<EstimateMealResult> => {
  const userId = await requireUserId();
  if (!canEstimate(description, photo !== null)) return { kind: "nothing_found" };
  // Checked before the Gemini call, not after: a missing meal should cost no request.
  if (!(await fetchOwnedMeal(userId, mealId))) return { kind: "meal_missing" };

  const estimate = await requestEstimate(description, photo);
  if ("kind" in estimate) return estimate;

  await db.transaction(async (tx) => {
    if (replacing) await removeUntouchedEstimate(tx, mealId);
    const productIds = await insertAiProducts(tx, userId, estimate.items);
    await appendItemsToMeal(tx, mealId, estimate.items.map((item, index) => toAmountRow(productIds[index], item)));
  });
  return { kind: "logged" };
};

export const undoMealEstimate = async (mealId: string): Promise<UndoMealEstimateResult> => {
  const userId = await requireUserId();
  // Generic for a missing meal and another user's alike, same as saveMealAsRecipe.
  if (!(await fetchOwnedMeal(userId, mealId))) return { kind: "meal_missing" };
  await db.transaction((tx) => removeUntouchedEstimate(tx, mealId));
  return { kind: "undone" };
};
