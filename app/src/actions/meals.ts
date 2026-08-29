"use server";

import { and, eq, gte, lt } from "drizzle-orm";

import { requireUserId } from "@/lib/auth/require-user";
import { dayBoundsInTimezone, type DayBounds } from "@/lib/date/day-bounds";
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

export interface DayMealSummary {
  id: string;
  name: string;
  total: NutritionValues;
}

export interface DayLog {
  meals: DayMealSummary[];
  dayTotal: NutritionValues;
}

interface ProductNutritionRow {
  energyKcal: string;
  fatG: string;
  saturatesG: string;
  carbohydrateG: string;
  sugarsG: string;
  proteinG: string;
  saltG: string;
}

const productRowToNutritionValues = (product: ProductNutritionRow): NutritionValues => ({
  energyKcal: Number(product.energyKcal),
  fatG: Number(product.fatG),
  saturatesG: Number(product.saturatesG),
  carbohydrateG: Number(product.carbohydrateG),
  sugarsG: Number(product.sugarsG),
  proteinG: Number(product.proteinG),
  saltG: Number(product.saltG),
});

interface DayMealIngredientRow {
  mealId: string;
  mealName: string;
  quantityG: string;
  product: ProductNutritionRow;
}

const DAY_MEAL_INGREDIENT_SELECTION = {
  mealId: meals.id,
  mealName: meals.name,
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
};

const fetchDayMealIngredientRows = async (
  userId: string,
  bounds: DayBounds,
): Promise<DayMealIngredientRow[]> =>
  db
    .select(DAY_MEAL_INGREDIENT_SELECTION)
    .from(mealIngredients)
    .innerJoin(meals, eq(mealIngredients.mealId, meals.id))
    .innerJoin(products, eq(mealIngredients.productId, products.id))
    .where(
      and(
        eq(meals.userId, userId),
        gte(mealIngredients.createdAt, bounds.start),
        lt(mealIngredients.createdAt, bounds.end),
      ),
    );

const toDayMealSummaries = (rows: DayMealIngredientRow[]): DayMealSummary[] =>
  rows.reduce<DayMealSummary[]>((summaries, row) => {
    const contribution = computeContribution(productRowToNutritionValues(row.product), Number(row.quantityG));
    const index = summaries.findIndex((summary) => summary.id === row.mealId);
    if (index === -1) {
      return [...summaries, { id: row.mealId, name: row.mealName, total: contribution }];
    }
    return summaries.map((summary, position) =>
      position === index ? { ...summary, total: addNutrition(summary.total, contribution) } : summary,
    );
  }, []);

export const getDayLog = async (date: string, timezone: string): Promise<DayLog> => {
  const userId = await requireUserId();
  const bounds = dayBoundsInTimezone(date, timezone);
  const rows = await fetchDayMealIngredientRows(userId, bounds);
  const dayMeals = toDayMealSummaries(rows);
  const dayTotal = dayMeals.reduce((total, meal) => addNutrition(total, meal.total), ZERO_NUTRITION);
  return { meals: dayMeals, dayTotal };
};

export interface MealIngredientDetail {
  id: string;
  productId: string;
  productName: string;
  quantityG: number;
  quantitySource: "ai_estimated" | "manual";
  contribution: NutritionValues;
}

export interface MealDetail {
  id: string;
  name: string;
  ingredients: MealIngredientDetail[];
  total: NutritionValues;
}

interface MealIngredientRow {
  id: string;
  productId: string;
  productName: string;
  quantityG: string;
  quantitySource: "ai_estimated" | "manual";
  product: ProductNutritionRow;
}

const MEAL_INGREDIENT_SELECTION = {
  id: mealIngredients.id,
  productId: mealIngredients.productId,
  productName: products.name,
  quantityG: mealIngredients.quantityG,
  quantitySource: mealIngredients.quantitySource,
  product: {
    energyKcal: products.energyKcal,
    fatG: products.fatG,
    saturatesG: products.saturatesG,
    carbohydrateG: products.carbohydrateG,
    sugarsG: products.sugarsG,
    proteinG: products.proteinG,
    saltG: products.saltG,
  },
};

const fetchMealIngredientRows = async (mealId: string): Promise<MealIngredientRow[]> =>
  db
    .select(MEAL_INGREDIENT_SELECTION)
    .from(mealIngredients)
    .innerJoin(products, eq(mealIngredients.productId, products.id))
    .where(eq(mealIngredients.mealId, mealId));

const toMealIngredientDetail = (row: MealIngredientRow): MealIngredientDetail => ({
  id: row.id,
  productId: row.productId,
  productName: row.productName,
  quantityG: Number(row.quantityG),
  quantitySource: row.quantitySource,
  contribution: computeContribution(productRowToNutritionValues(row.product), Number(row.quantityG)),
});

export const getMealDetail = async (mealId: string): Promise<MealDetail | null> => {
  const userId = await requireUserId();
  const [meal] = await db
    .select({ id: meals.id, name: meals.name })
    .from(meals)
    .where(and(eq(meals.id, mealId), eq(meals.userId, userId)));
  if (!meal) {
    return null;
  }

  const rows = await fetchMealIngredientRows(mealId);
  const ingredients = rows.map(toMealIngredientDetail);
  const total = ingredients.reduce((sum, ingredient) => addNutrition(sum, ingredient.contribution), ZERO_NUTRITION);
  return { id: meal.id, name: meal.name, ingredients, total };
};
