"use server";

import { and, eq, gte } from "drizzle-orm";

import { requireUserId } from "@/lib/auth/require-user";
import { db } from "@/lib/db";
import { mealIngredients, meals, products } from "@/lib/db/schema";

import { computeContribution } from "./meals.utils";
import { NotAuthorizedError } from "./meals.errors";
import type { NutritionValues } from "./products";

export interface SaveMealIngredientInput {
  mealId: string;
  productId: string;
  quantityG: number;
  quantitySource: "ai_estimated" | "manual";
}

const assertMealOwnership = async (mealId: string, userId: string): Promise<void> => {
  const [meal] = await db.select({ userId: meals.userId }).from(meals).where(eq(meals.id, mealId));
  if (!meal || meal.userId !== userId) {
    throw new NotAuthorizedError();
  }
};

export const saveMealIngredient = async (
  input: SaveMealIngredientInput,
): Promise<{ mealIngredientId: string }> => {
  const userId = await requireUserId();
  await assertMealOwnership(input.mealId, userId);

  const [row] = await db
    .insert(mealIngredients)
    .values({
      mealId: input.mealId,
      productId: input.productId,
      quantityG: String(input.quantityG),
      quantitySource: input.quantitySource,
    })
    .returning({ id: mealIngredients.id });

  return { mealIngredientId: row.id };
};

export interface CreateMealInput {
  name: string;
}

export const createMeal = async (input: CreateMealInput): Promise<{ mealId: string }> => {
  const userId = await requireUserId();
  const [row] = await db.insert(meals).values({ userId, name: input.name }).returning({ id: meals.id });
  return { mealId: row.id };
};

export const getMeal = async (mealId: string): Promise<{ id: string; name: string } | null> => {
  const userId = await requireUserId();
  const [meal] = await db
    .select({ id: meals.id, name: meals.name })
    .from(meals)
    .where(and(eq(meals.id, mealId), eq(meals.userId, userId)));
  return meal ?? null;
};

const ZERO_NUTRITION: NutritionValues = {
  energyKcal: 0,
  fatG: 0,
  saturatesG: 0,
  carbohydrateG: 0,
  sugarsG: 0,
  proteinG: 0,
  saltG: 0,
};

const addNutrition = (a: NutritionValues, b: NutritionValues): NutritionValues => ({
  energyKcal: a.energyKcal + b.energyKcal,
  fatG: a.fatG + b.fatG,
  saturatesG: a.saturatesG + b.saturatesG,
  carbohydrateG: a.carbohydrateG + b.carbohydrateG,
  sugarsG: a.sugarsG + b.sugarsG,
  proteinG: a.proteinG + b.proteinG,
  saltG: a.saltG + b.saltG,
});

const startOfTodayUtc = (): Date => {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
};

// "Today" = the server's UTC calendar day. A known simplification, not a
// real timezone implementation - M3's full day view must revisit it
// (design spec §10).
const fetchTodayContributions = async (userId: string): Promise<NutritionValues[]> => {
  const rows = await db
    .select({
      quantityG: mealIngredients.quantityG,
      product: {
        energyKcal: products.energyKcal,
        fatG: products.fatG,
        saturatesG: products.saturatesG,
        carbohydrateG: products.carbohydrateG,
        sugarsG: products.sugarsG,
        proteinG: products.proteinG,
        saltG: products.saltG,
      },
    })
    .from(mealIngredients)
    .innerJoin(meals, eq(mealIngredients.mealId, meals.id))
    .innerJoin(products, eq(mealIngredients.productId, products.id))
    .where(and(eq(meals.userId, userId), gte(mealIngredients.createdAt, startOfTodayUtc())));

  return rows.map((row) =>
    computeContribution(
      {
        energyKcal: Number(row.product.energyKcal),
        fatG: Number(row.product.fatG),
        saturatesG: Number(row.product.saturatesG),
        carbohydrateG: Number(row.product.carbohydrateG),
        sugarsG: Number(row.product.sugarsG),
        proteinG: Number(row.product.proteinG),
        saltG: Number(row.product.saltG),
      },
      Number(row.quantityG),
    ),
  );
};

export const getTodayTotal = async (): Promise<NutritionValues> => {
  const userId = await requireUserId();
  const contributions = await fetchTodayContributions(userId);
  return contributions.reduce(addNutrition, ZERO_NUTRITION);
};
