"use server";

import { and, eq, gte, lt, sql } from "drizzle-orm";

import { requireUserId } from "@/lib/auth/require-user";
import { dayBoundsInTimezone, type DayBounds } from "@/lib/date/day-bounds";
import { db } from "@/lib/db";
import { mealIngredients, meals, products } from "@/lib/db/schema";

import { computeContribution, HISTORY_PAGE_SIZE } from "./meals.utils";
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

const assertMealIngredientOwnership = async (mealIngredientId: string, userId: string): Promise<void> => {
  const [row] = await db
    .select({ mealId: mealIngredients.mealId })
    .from(mealIngredients)
    .where(eq(mealIngredients.id, mealIngredientId));
  if (!row) {
    throw new NotAuthorizedError();
  }
  await assertMealOwnership(row.mealId, userId);
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

export const removeMealIngredient = async (mealIngredientId: string): Promise<void> => {
  const userId = await requireUserId();
  await assertMealIngredientOwnership(mealIngredientId, userId);
  await db.delete(mealIngredients).where(eq(mealIngredients.id, mealIngredientId));
};

export const updateMealIngredientQuantity = async (
  mealIngredientId: string,
  quantityG: number,
): Promise<void> => {
  const userId = await requireUserId();
  await assertMealIngredientOwnership(mealIngredientId, userId);
  await db
    .update(mealIngredients)
    .set({ quantityG: String(quantityG), quantitySource: "manual" })
    .where(eq(mealIngredients.id, mealIngredientId));
};

export interface DayHistoryEntry {
  date: string; // YYYY-MM-DD, local to the requested timezone
  totalKcal: number;
}

export interface DayHistoryPage {
  entries: DayHistoryEntry[];
  nextOffset: number | null;
}

// A `type` alias (not `interface`) so it structurally satisfies db.execute's
// `Record<string, unknown>` constraint - matching matchProduct's CandidateRow
// precedent for raw sql`` row shapes.
type DayHistoryRow = {
  local_date: string | Date;
  total_kcal: string;
};

const ISO_DATE_LENGTH = 10; // "YYYY-MM-DD".length

// Postgres's `date` type comes back from `pg` as a JS Date at UTC midnight in
// some driver/type-parser configurations and as a string in others; handling
// both here keeps this correct regardless of which applies. (Verified against
// this project's actual db.execute path: it returns a string.)
const toLocalDateString = (value: string | Date): string =>
  value instanceof Date ? value.toISOString().slice(0, ISO_DATE_LENGTH) : value;

const fetchDayHistoryRows = async (
  userId: string,
  timezone: string,
  offset: number,
): Promise<DayHistoryRow[]> => {
  const result = await db.execute<DayHistoryRow>(sql`
    SELECT date_trunc('day', mi.created_at AT TIME ZONE 'UTC' AT TIME ZONE ${timezone})::date AS local_date,
           SUM(p.energy_kcal * (mi.quantity_g / 100)) AS total_kcal
    FROM meal_ingredients mi
    JOIN meals m ON m.id = mi.meal_id
    JOIN products p ON p.id = mi.product_id
    WHERE m.user_id = ${userId}
    GROUP BY local_date
    ORDER BY local_date DESC
    LIMIT ${HISTORY_PAGE_SIZE} OFFSET ${offset}
  `);
  return result.rows;
};

export const getDayHistory = async (timezone: string, offset: number = 0): Promise<DayHistoryPage> => {
  const userId = await requireUserId();
  const rows = await fetchDayHistoryRows(userId, timezone, offset);
  const entries = rows.map((row) => ({
    date: toLocalDateString(row.local_date),
    totalKcal: Number(row.total_kcal),
  }));

  return {
    entries,
    nextOffset: entries.length === HISTORY_PAGE_SIZE ? offset + HISTORY_PAGE_SIZE : null,
  };
};
