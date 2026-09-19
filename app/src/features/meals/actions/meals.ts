"use server";

import { and, eq, gte, isNull, lt, sql, type SQL } from "drizzle-orm";

import { requireUserId } from "@/lib/auth/require-user";
import { dayBoundsInTimezone, localDateStringOf, type DayBounds } from "@/lib/date/day-bounds";
import { db } from "@/lib/db";
import { portionOverridesSelection } from "@/lib/db/portion-overrides-sql";
import { effectiveNutritionSelection, overrideJoinSql } from "@/lib/db/effective-nutrition";
import { mealIngredients, meals, productOverrides, products } from "@/lib/db/schema";
import type { Portion } from "@/lib/measures/portions";
import { resolvePortions } from "@/lib/measures/resolve-portions";

import { computeContribution, HISTORY_PAGE_SIZE } from "./meals.utils";
import { NotAuthorizedError } from "./meals.errors";
import { fetchCalorieGoal } from "@/features/goals/actions/goals";
import { calorieRemaining, type CalorieRemaining } from "@/features/goals/actions/goals.utils";
import type { NutritionValues } from "@/types/nutrition";

export interface SaveMealIngredientInput {
  mealId: string;
  productId: string;
  quantity: number;
  quantityUnit: string;
  quantitySource: "ai_estimated" | "manual";
  entryCount: number;
  entryUnit: string;
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
      quantity: String(input.quantity),
      quantityUnit: input.quantityUnit,
      entryCount: String(input.entryCount),
      entryUnit: input.entryUnit,
      quantitySource: input.quantitySource,
    })
    .returning({ id: mealIngredients.id });

  return { mealIngredientId: row.id };
};

// Long past any undo a user could still reach, so a purge never races a tap.
const SOFT_DELETE_RETENTION = sql`interval '1 day'`;

// Ingredients go first: a purged meal's rows would otherwise block its delete.
const purgeSoftDeleted = async (userId: string): Promise<void> => {
  await db.execute(sql`
    DELETE FROM meal_ingredients mi
    USING meals m
    WHERE mi.meal_id = m.id
      AND m.user_id = ${userId}
      AND (mi.deleted_at < now() - ${SOFT_DELETE_RETENTION} OR m.deleted_at < now() - ${SOFT_DELETE_RETENTION})
  `);
  await db.execute(sql`
    DELETE FROM meals WHERE user_id = ${userId} AND deleted_at < now() - ${SOFT_DELETE_RETENTION}
  `);
};

const sweepEmptyMeals = async (userId: string): Promise<void> => {
  try {
    await purgeSoftDeleted(userId);
    await db.execute(sql`
      DELETE FROM meals m
      WHERE m.user_id = ${userId}
        AND NOT EXISTS (SELECT 1 FROM meal_ingredients mi WHERE mi.meal_id = m.id)
    `);
  } catch (error) {
    console.error("Failed to sweep empty meals for user", userId, error);
  }
};

export const createMeal = async (): Promise<{ mealId: string }> => {
  const userId = await requireUserId();
  await sweepEmptyMeals(userId);
  const [row] = await db.insert(meals).values({ userId }).returning({ id: meals.id });
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
  total: NutritionValues;
  ingredientNames: string[];
}

export interface DayLog {
  meals: DayMealSummary[];
  dayTotal: NutritionValues;
  calorieGoal: number | null;
  calorieRemaining: CalorieRemaining;
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
  mealCreatedAt: Date;
  productName: string;
  quantity: string;
  nutritionBasisQuantity: string;
  product: ProductNutritionRow;
}

const dayMealIngredientSelection = () => ({
  mealId: meals.id,
  mealCreatedAt: meals.createdAt,
  productName: products.name,
  quantity: mealIngredients.quantity,
  nutritionBasisQuantity: products.nutritionBasisQuantity,
  product: effectiveNutritionSelection(),
});

const fetchDayMealIngredientRows = async (
  userId: string,
  bounds: DayBounds,
): Promise<DayMealIngredientRow[]> =>
  db
    .select(dayMealIngredientSelection())
    .from(mealIngredients)
    .innerJoin(meals, eq(mealIngredients.mealId, meals.id))
    .innerJoin(products, eq(mealIngredients.productId, products.id))
    // The day total is this user's day, so it reads this user's corrections.
    .leftJoin(
      productOverrides,
      and(eq(productOverrides.productId, products.id), eq(productOverrides.userId, userId)),
    )
    .where(
      and(
        eq(meals.userId, userId),
        isNull(meals.deletedAt),
        isNull(mealIngredients.deletedAt),
        gte(mealIngredients.createdAt, bounds.start),
        lt(mealIngredients.createdAt, bounds.end),
      ),
    )
    .orderBy(meals.createdAt, mealIngredients.createdAt);

const contributionForRow = (row: DayMealIngredientRow): NutritionValues =>
  computeContribution(
    productRowToNutritionValues(row.product),
    Number(row.quantity),
    Number(row.nutritionBasisQuantity),
  );

const mergeRowIntoSummaries = (
  summaries: DayMealSummary[],
  row: DayMealIngredientRow,
  contribution: NutritionValues,
): DayMealSummary[] => {
  const existing = summaries.find((summary) => summary.id === row.mealId);
  if (!existing) {
    return [
      ...summaries,
      {
        id: row.mealId,
        total: contribution,
        ingredientNames: [row.productName],
      },
    ];
  }
  return summaries.map((summary) =>
    summary.id === row.mealId
      ? {
          ...summary,
          total: addNutrition(summary.total, contribution),
          ingredientNames: [...summary.ingredientNames, row.productName],
        }
      : summary,
  );
};

const toDayMealSummaries = (rows: DayMealIngredientRow[]): DayMealSummary[] =>
  rows.reduce<DayMealSummary[]>(
    (summaries, row) => mergeRowIntoSummaries(summaries, row, contributionForRow(row)),
    [],
  );

export const getDayLog = async (date: string, timezone: string): Promise<DayLog> => {
  const userId = await requireUserId();
  const bounds = dayBoundsInTimezone(date, timezone);
  const [rows, calorieGoal] = await Promise.all([
    fetchDayMealIngredientRows(userId, bounds),
    fetchCalorieGoal(userId),
  ]);
  const dayMeals = toDayMealSummaries(rows);
  const dayTotal = dayMeals.reduce((total, meal) => addNutrition(total, meal.total), ZERO_NUTRITION);
  return { meals: dayMeals, dayTotal, calorieGoal, calorieRemaining: calorieRemaining(calorieGoal, dayTotal.energyKcal) };
};

export interface MealIngredientDetail {
  id: string;
  productId: string;
  productName: string;
  quantity: number;
  quantityUnit: string;
  /** Null on rows written before the entry columns existed. */
  entryCount: number | null;
  entryUnit: string | null;
  quantitySource: "ai_estimated" | "manual";
  contribution: NutritionValues;
  densityGMl: number | null;
  servingUnit: string | null;
  servingGrams: number | null;
  nutritionBasisUnit: string;
  /** Resolved server-side, same as on a product DTO: the edit control offers
   * these labels as units, so an amount logged as "1 slice" stays editable. */
  portions: readonly Portion[];
}

export interface MealDetail {
  id: string;
  mealNumber: number; // 1-based position among the user's meals in the meal's own local day
  date: string; // YYYY-MM-DD, the meal's own local day - not necessarily today's
  ingredients: MealIngredientDetail[];
  total: NutritionValues;
  // Goal minus the FULL local day's total (all meals, not just this one) -
  // same number the home hero shows for that day.
  dayCalorieRemaining: CalorieRemaining;
}

interface ProductMeasureColumns {
  nameSearch: string;
  standardSlug: string | null;
  densityGMl: string | null;
  servingUnit: string | null;
  servingGrams: string | null;
  nutritionBasisUnit: string;
}

interface MealIngredientRow {
  id: string;
  productId: string;
  productName: string;
  quantity: string;
  quantityUnit: string;
  entryCount: string | null;
  entryUnit: string | null;
  nutritionBasisQuantity: string;
  quantitySource: "ai_estimated" | "manual";
  product: ProductNutritionRow;
  measures: ProductMeasureColumns & { portionOverrides: Record<string, string> };
}

// Only the nutrition figures are overridden: measures and the nutrition basis
// still come from the canonical row, because a correction changes the figures,
// not what they are stated per.
const mealIngredientSelection = (userId: string) => ({
  id: mealIngredients.id,
  productId: mealIngredients.productId,
  productName: products.name,
  quantity: mealIngredients.quantity,
  quantityUnit: mealIngredients.quantityUnit,
  entryCount: mealIngredients.entryCount,
  entryUnit: mealIngredients.entryUnit,
  nutritionBasisQuantity: products.nutritionBasisQuantity,
  quantitySource: mealIngredients.quantitySource,
  product: effectiveNutritionSelection(),
  measures: {
    nameSearch: products.nameSearch,
    standardSlug: products.standardSlug,
    densityGMl: products.densityGMl,
    servingUnit: products.servingUnit,
    servingGrams: products.servingGrams,
    nutritionBasisUnit: products.nutritionBasisUnit,
    portionOverrides: portionOverridesSelection(userId),
  },
});

const fetchMealIngredientRows = async (userId: string, mealId: string): Promise<MealIngredientRow[]> =>
  db
    .select(mealIngredientSelection(userId))
    .from(mealIngredients)
    .innerJoin(products, eq(mealIngredients.productId, products.id))
    .leftJoin(
      productOverrides,
      and(eq(productOverrides.productId, products.id), eq(productOverrides.userId, userId)),
    )
    .where(and(eq(mealIngredients.mealId, mealId), isNull(mealIngredients.deletedAt)))
    .orderBy(mealIngredients.createdAt);

const toMealIngredientDetail = (row: MealIngredientRow): MealIngredientDetail => ({
  id: row.id,
  productId: row.productId,
  productName: row.productName,
  quantity: Number(row.quantity),
  quantityUnit: row.quantityUnit,
  entryCount: row.entryCount === null ? null : Number(row.entryCount),
  entryUnit: row.entryUnit,
  quantitySource: row.quantitySource,
  contribution: computeContribution(
    productRowToNutritionValues(row.product),
    Number(row.quantity),
    Number(row.nutritionBasisQuantity),
  ),
  densityGMl: row.measures.densityGMl === null ? null : Number(row.measures.densityGMl),
  servingUnit: row.measures.servingUnit,
  servingGrams: row.measures.servingGrams === null ? null : Number(row.measures.servingGrams),
  nutritionBasisUnit: row.measures.nutritionBasisUnit,
  // The user's own portion weights apply here too: the edit control on this
  // row re-resolves a new amount, so showing it the standard slice while the
  // capture step shows their own would be the same bread in two weights. The
  // quantity already saved is untouched - it is stored in grams.
  portions: resolvePortions({
    standardSlug: row.measures.standardSlug,
    nameSearch: row.measures.nameSearch,
    servingUnit: row.measures.servingUnit,
    servingGrams: row.measures.servingGrams === null ? null : Number(row.measures.servingGrams),
    nutritionBasisUnit: row.measures.nutritionBasisUnit,
    overrides: Object.fromEntries(
      Object.entries(row.measures.portionOverrides).map(([label, grams]) => [label, Number(grams)]),
    ),
  }),
});

// Upper bound is read back in SQL, not bound as a JS value: Postgres keeps
// microsecond precision but a JS Date only carries milliseconds, so a
// rebound createdAt could exclude the meal from its own count.
const mealNumberInLocalDay = async (
  userId: string,
  mealId: string,
  localDate: string,
  timezone: string,
): Promise<number> => {
  const { start } = dayBoundsInTimezone(localDate, timezone);
  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(meals)
    .where(
      and(
        eq(meals.userId, userId),
        isNull(meals.deletedAt),
        gte(meals.createdAt, start),
        sql`${meals.createdAt} <= (select target.created_at from meals target where target.id = ${mealId})`,
      ),
    );
  return count;
};

// Same day-wide figure the home hero shows for that date - goal minus every
// meal's kcal that day, not just this one.
const fetchDayCalorieRemaining = async (
  userId: string,
  localDate: string,
  timezone: string,
): Promise<CalorieRemaining> => {
  const [dayRows, calorieGoal] = await Promise.all([
    fetchDayMealIngredientRows(userId, dayBoundsInTimezone(localDate, timezone)),
    fetchCalorieGoal(userId),
  ]);
  const dayTotalKcal = toDayMealSummaries(dayRows).reduce((sum, summary) => sum + summary.total.energyKcal, 0);
  return calorieRemaining(calorieGoal, dayTotalKcal);
};

export const getMealDetail = async (mealId: string, timezone: string): Promise<MealDetail | null> => {
  const userId = await requireUserId();
  const [meal] = await db
    .select({ id: meals.id, createdAt: meals.createdAt })
    .from(meals)
    .where(and(eq(meals.id, mealId), eq(meals.userId, userId), isNull(meals.deletedAt)));
  if (!meal) {
    return null;
  }

  const rows = await fetchMealIngredientRows(userId, mealId);
  const ingredients = rows.map(toMealIngredientDetail);
  const total = ingredients.reduce((sum, ingredient) => addNutrition(sum, ingredient.contribution), ZERO_NUTRITION);
  const localDate = localDateStringOf(meal.createdAt, timezone);
  const [mealNumber, dayCalorieRemaining] = await Promise.all([
    mealNumberInLocalDay(userId, meal.id, localDate, timezone),
    fetchDayCalorieRemaining(userId, localDate, timezone),
  ]);
  return {
    id: meal.id,
    mealNumber,
    date: localDate,
    ingredients,
    total,
    dayCalorieRemaining,
  };
};

// Removal and deletion are soft so the UI can offer undo instead of a
// "this can't be undone" confirm. purgeSoftDeleted hard-deletes them later.
const setMealIngredientDeletedAt = async (mealIngredientId: string, deletedAt: SQL | null): Promise<void> => {
  const userId = await requireUserId();
  await assertMealIngredientOwnership(mealIngredientId, userId);
  await db.update(mealIngredients).set({ deletedAt }).where(eq(mealIngredients.id, mealIngredientId));
};

const setMealDeletedAt = async (mealId: string, deletedAt: SQL | null): Promise<void> => {
  const userId = await requireUserId();
  await assertMealOwnership(mealId, userId);
  await db.update(meals).set({ deletedAt }).where(eq(meals.id, mealId));
};

export const removeMealIngredient = async (mealIngredientId: string): Promise<void> =>
  setMealIngredientDeletedAt(mealIngredientId, sql`now()`);

export const restoreMealIngredient = async (mealIngredientId: string): Promise<void> =>
  setMealIngredientDeletedAt(mealIngredientId, null);

export const deleteMeal = async (mealId: string): Promise<void> => setMealDeletedAt(mealId, sql`now()`);

export const restoreMeal = async (mealId: string): Promise<void> => setMealDeletedAt(mealId, null);

export const discardEmptyMeal = async (mealId: string): Promise<void> => {
  const userId = await requireUserId();
  await assertMealOwnership(mealId, userId);
  await db.execute(sql`
    DELETE FROM meals
    WHERE id = ${mealId}
      AND NOT EXISTS (SELECT 1 FROM meal_ingredients mi WHERE mi.meal_id = ${mealId})
  `);
};

export const updateMealIngredientQuantity = async (
  mealIngredientId: string,
  quantity: number,
  quantityUnit: string,
  entryCount: number,
  entryUnit: string,
): Promise<void> => {
  const userId = await requireUserId();
  await assertMealIngredientOwnership(mealIngredientId, userId);
  await db
    .update(mealIngredients)
    .set({
      quantity: String(quantity),
      quantityUnit,
      entryCount: String(entryCount),
      entryUnit,
      quantitySource: "manual",
    })
    .where(eq(mealIngredients.id, mealIngredientId));
};

// Five distinct amounts is about a week of one product's habits: enough that
// the chip a user reaches for is usually already there, few enough that the
// wrapped row stays scannable.
const RECENT_AMOUNT_LIMIT = 5;

export interface RecentAmount {
  count: number;
  unit: string;
  grams: number;
}

type RecentAmountRow = { entry_count: string; entry_unit: string; quantity: string };

/**
 * How this user last logged this product, one entry per distinct amount.
 *
 * The amount is the count and the unit together, not the unit alone: somebody
 * who alternates 200 g and 250 g wants both chips, and collapsing to one per
 * unit hands back whichever they typed last. DISTINCT ON therefore keys on
 * the pair, so "1 slice" and "2 slice" both survive while a repeat of either
 * collapses to its newest row. The outer ORDER BY puts the most recently used
 * amount first - the inner one has to sort by the DISTINCT ON key to work at
 * all, which is not the order anybody wants to read.
 *
 * `grams` comes straight off `quantity`, which is already the resolved
 * weight - nothing is re-resolved here, so a chip can never disagree with
 * the row it came from.
 */
export const recentAmounts = async (productId: string): Promise<RecentAmount[]> => {
  const userId = await requireUserId();
  const result = await db.execute<RecentAmountRow>(sql`
    SELECT latest.entry_count, latest.entry_unit, latest.quantity
    FROM (
      SELECT DISTINCT ON (mi.entry_count, mi.entry_unit)
             mi.entry_count, mi.entry_unit, mi.quantity, mi.created_at
        FROM meal_ingredients mi
        JOIN meals m ON m.id = mi.meal_id
       WHERE m.user_id = ${userId}
         AND mi.product_id = ${productId}
         AND mi.deleted_at IS NULL
         AND m.deleted_at IS NULL
         AND mi.entry_unit IS NOT NULL
         AND mi.entry_count IS NOT NULL
       ORDER BY mi.entry_count, mi.entry_unit, mi.created_at DESC
    ) latest
    ORDER BY latest.created_at DESC
    LIMIT ${RECENT_AMOUNT_LIMIT}
  `);

  return result.rows.map((row) => ({
    count: Number(row.entry_count),
    unit: row.entry_unit,
    grams: Number(row.quantity),
  }));
};

export interface DayHistoryEntry {
  date: string; // YYYY-MM-DD, local to the requested timezone
  totalKcal: number;
}

export interface DayHistoryPage {
  entries: DayHistoryEntry[];
  nextOffset: number | null;
  // The goal as it stands today, not as it stood on each listed day - the app
  // keeps one goal per user with no history behind it.
  calorieGoal: number | null;
}

// `type` (not `interface`) so it structurally satisfies db.execute's
// `Record<string, unknown>` constraint, matching CandidateRow's precedent.
type DayHistoryRow = {
  local_date: string | Date;
  total_kcal: string;
};

const ISO_DATE_LENGTH = 10; // "YYYY-MM-DD".length

// Postgres's `date` type can come back as a JS Date (UTC midnight) or a
// string depending on driver config; this handles both regardless of which.
const toLocalDateString = (value: string | Date): string =>
  value instanceof Date ? value.toISOString().slice(0, ISO_DATE_LENGTH) : value;

// Energy alone, coalesced inline: the day list shows one figure per day, and a
// single-column helper in effective-nutrition.ts would exist for this one call.
// The basis quantity stays canonical - a correction changes the figures, not
// what they are stated per.
const fetchDayHistoryRows = async (
  userId: string,
  timezone: string,
  offset: number,
): Promise<DayHistoryRow[]> => {
  const result = await db.execute<DayHistoryRow>(sql`
    SELECT date_trunc('day', mi.created_at AT TIME ZONE 'UTC' AT TIME ZONE ${timezone})::date AS local_date,
           SUM(coalesce(o.energy_kcal, p.energy_kcal) * (mi.quantity / p.nutrition_basis_quantity)) AS total_kcal
    FROM meal_ingredients mi
    JOIN meals m ON m.id = mi.meal_id
    JOIN products p ON p.id = mi.product_id
    ${overrideJoinSql("p", "o", userId)}
    WHERE m.user_id = ${userId}
      AND m.deleted_at IS NULL
      AND mi.deleted_at IS NULL
    GROUP BY local_date
    ORDER BY local_date DESC
    LIMIT ${HISTORY_PAGE_SIZE} OFFSET ${offset}
  `);
  return result.rows;
};

export const getDayHistory = async (timezone: string, offset: number = 0): Promise<DayHistoryPage> => {
  const userId = await requireUserId();
  const [rows, calorieGoal] = await Promise.all([
    fetchDayHistoryRows(userId, timezone, offset),
    fetchCalorieGoal(userId),
  ]);
  const entries = rows.map((row) => ({
    date: toLocalDateString(row.local_date),
    totalKcal: Number(row.total_kcal),
  }));

  return {
    entries,
    nextOffset: entries.length === HISTORY_PAGE_SIZE ? offset + HISTORY_PAGE_SIZE : null,
    calorieGoal,
  };
};
