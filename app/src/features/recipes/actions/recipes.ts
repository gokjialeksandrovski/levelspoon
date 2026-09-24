"use server";

import { requireUserId } from "@/lib/auth/require-user";
import { db } from "@/lib/db";

import { isValidRecipeName } from "./recipes.utils";
import {
  EmptyRecipeError,
  InvalidRecipeNameError,
  MealNotFoundError,
} from "./recipes.errors";
import {
  fetchMealItems,
  fetchOwnedMeal,
  fetchRecipeSummaries,
  insertRecipe,
  replaceRecipeItems,
  setMealRecipe,
  type RecipeSummary,
} from "./recipes.store";

export type SaveRecipeResult =
  | { kind: "saved"; recipeId: string; name: string }
  | { kind: "invalid_name" }
  | { kind: "empty_meal" }
  | { kind: "meal_missing" }
  | { kind: "failed" };

/** The picker's feed: name, item count and live figures, most recently used
 * first. Private by construction - the store filters on the session user. */
export const listRecipes = async (): Promise<RecipeSummary[]> => {
  const userId = await requireUserId();
  return fetchRecipeSummaries(userId);
};

/**
 * Files the meal's live rows as a recipe and links the meal to it.
 *
 * The refusals travel as data. A thrown class would reach the sheet as a bare
 * Error, so the classes below never leave this module.
 */
export const saveMealAsRecipe = async (mealId: string, name: string): Promise<SaveRecipeResult> => {
  const userId = await requireUserId();
  try {
    if (!isValidRecipeName(name)) throw new InvalidRecipeNameError();
    const meal = await fetchOwnedMeal(userId, mealId);
    // Generic for a missing meal and for another user's meal alike: naming
    // the difference would confirm the row exists.
    if (!meal) throw new MealNotFoundError();
    const items = await fetchMealItems(mealId);
    if (items.length === 0) throw new EmptyRecipeError();

    const recipeId = await db.transaction(async (tx) => {
      const id = await insertRecipe(tx, userId, name);
      await replaceRecipeItems(tx, id, items);
      await setMealRecipe(tx, mealId, id);
      return id;
    });
    return { kind: "saved", recipeId, name: name.trim() };
  } catch (error) {
    if (error instanceof InvalidRecipeNameError) return { kind: "invalid_name" };
    if (error instanceof MealNotFoundError) return { kind: "meal_missing" };
    if (error instanceof EmptyRecipeError) return { kind: "empty_meal" };
    throw error;
  }
};
