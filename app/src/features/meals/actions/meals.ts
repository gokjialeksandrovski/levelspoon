"use server";

import { and, eq, isNull, sql, type SQL } from "drizzle-orm";
import { refresh } from "next/cache";

import { requireUserId } from "@/lib/auth/require-user";
import { todayLocalDateString } from "@/lib/date/day-bounds";
import { db } from "@/lib/db";
import { portionOverridesSelection } from "@/lib/db/portion-overrides-sql";
import { effectiveNutritionSelection, overrideJoinSql } from "@/lib/db/effective-nutrition";
import { AI_ESTIMATE_ORIGIN, mealIngredients, meals, productOverrides, products } from "@/lib/db/schema";
import type { Portion } from "@/lib/measures/portions";
import { resolvePortions } from "@/lib/measures/resolve-portions";
import {
  ZERO_NUTRITION,
  addNutrition,
  fibreCoverage,
  productRowToNutritionValues,
  type FibreCoverage,
  type ProductNutritionRow,
} from "@/lib/nutrition/totals";

import {
  computeContribution,
  HISTORY_PAGE_SIZE,
  isUuid,
  isValidPasteItems,
  MAX_HISTORY_PAGES,
  type PasteItem,
} from "./meals.utils";
import { fetchUnavailableProductIds } from "./meals.store";
import { InvalidLogDateError, NotAuthorizedError } from "./meals.errors";
import { fetchCalorieGoal, fetchMacroTargets } from "@/features/goals/actions/goals.store";
import type { MacroTargets } from "@/features/goals/actions/macro-targets.utils";
import {
  appendItemsToMeal,
  fetchMealItems,
  fetchOwnedMeal,
  fetchOwnedRecipe,
  fetchRecipeItems,
  recipeHasAiItems,
} from "@/features/recipes/actions/recipes.store";
import { mealMatchesRecipe, recipeIsSubsetOfMeal } from "@/features/recipes/actions/recipes.utils";
import { fetchWeightView } from "@/features/weight/actions/weight.store";
import type { WeightView } from "@/features/weight/actions/weight.utils";
import { calorieRemaining, type CalorieRemaining } from "@/features/goals/actions/goals.utils";
import type { NutritionValues } from "@/types/nutrition";

interface SaveMealIngredientInput {
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

  // Every write a page shows calls refresh(): the open page re-renders with it
  // in this same response, and the client cache drops every other page, so
  // Back can't land on figures from before the write.
  refresh();
  return { mealIngredientId: row.id };
};

// Long past any undo a user could still reach, so a purge never races a tap.
const SOFT_DELETE_RETENTION = sql`interval '1 day'`;

// One statement, one round trip, ahead of every createMeal insert. Purges
// expired soft deletes, then drops every meal left with no ingredients.
// Every WITH sub-statement reads the same snapshot, so "left with none" has to
// exclude the rows the CTE is deleting; the foreign key is checked at the end
// of the statement, by which point a purged meal's rows are gone too.
const sweepEmptyMeals = async (userId: string): Promise<void> => {
  try {
    await db.execute(sql`
      WITH purged_ingredients AS (
        DELETE FROM meal_ingredients mi
        USING meals m
        WHERE mi.meal_id = m.id
          AND m.user_id = ${userId}
          AND (mi.deleted_at < now() - ${SOFT_DELETE_RETENTION} OR m.deleted_at < now() - ${SOFT_DELETE_RETENTION})
        RETURNING mi.id
      )
      DELETE FROM meals m
      WHERE m.user_id = ${userId}
        AND (
          m.deleted_at < now() - ${SOFT_DELETE_RETENTION}
          OR NOT EXISTS (
            SELECT 1 FROM meal_ingredients mi
            WHERE mi.meal_id = m.id AND mi.id NOT IN (SELECT id FROM purged_ingredients)
          )
        )
    `);
  } catch (error) {
    console.error("Failed to sweep empty meals for user", userId, error);
  }
};

const LOG_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

// The browser picks the day, so the day is checked here rather than trusted:
// a future date would file a meal on a day the user cannot have eaten yet, and
// no screen offers one. Past dates are unbounded on purpose - somebody filling
// in last week is doing exactly what this exists for.
const assertLoggableDate = (logDate: string, timezone: string): void => {
  if (!LOG_DATE_PATTERN.test(logDate) || logDate > todayLocalDateString(timezone)) {
    throw new InvalidLogDateError(logDate);
  }
};

/**
 * Starts a meal on `logDate`, the user's own local calendar day.
 *
 * The day is an argument rather than `now()`: the whole point is that a meal
 * eaten yesterday can be entered today, and a day read from a clock at insert
 * time files it under whichever day the machine is having.
 */
export const createMeal = async (logDate: string, timezone: string): Promise<{ mealId: string }> => {
  const userId = await requireUserId();
  assertLoggableDate(logDate, timezone);
  await sweepEmptyMeals(userId);
  const [row] = await db.insert(meals).values({ userId, logDate }).returning({ id: meals.id });
  return { mealId: row.id };
};

export interface DayMealSummary {
  id: string;
  total: NutritionValues;
  ingredientNames: string[];
}

export interface DayLog {
  meals: DayMealSummary[];
  dayTotal: NutritionValues;
  dayFibreCoverage: FibreCoverage;
  calorieGoal: number | null;
  calorieRemaining: CalorieRemaining;
  macroTargets: MacroTargets | null;
  // Today only: a past day's weight is not today's weight, and a check-in
  // prompt on a day that has passed asks for a reading nobody can take.
  weight: WeightView | null;
}

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
  logDate: string | SQL,
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
        eq(meals.logDate, logDate),
        isNull(meals.deletedAt),
        isNull(mealIngredients.deletedAt),
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
  const isToday = date === todayLocalDateString(timezone);
  const [rows, calorieGoal, macroTargets, weight] = await Promise.all([
    fetchDayMealIngredientRows(userId, date),
    fetchCalorieGoal(userId),
    fetchMacroTargets(userId),
    isToday ? fetchWeightView(userId) : Promise.resolve(null),
  ]);
  const dayMeals = toDayMealSummaries(rows);
  const dayTotal = dayMeals.reduce((total, meal) => addNutrition(total, meal.total), ZERO_NUTRITION);
  return {
    meals: dayMeals,
    dayTotal,
    dayFibreCoverage: fibreCoverage(rows.map((row) => row.product)),
    calorieGoal,
    calorieRemaining: calorieRemaining(calorieGoal, dayTotal.energyKcal),
    macroTargets,
    weight,
  };
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
  /** Lazy-track guess: tagged in the row, and no correction link. */
  isAiEstimate: boolean;
}

export interface MealRecipeLink {
  id: string;
  name: string;
  /** Whether this meal's live rows still equal the recipe's items. Computed,
   * never stored: "the user edited this meal" and "the recipe moved under it"
   * are the same fact, and a stored flag would have to be cleared and set by
   * every ingredient write path. */
  matches: boolean;
  /** Whether the recipe's items are all still present, allowing extra rows
   * the recipe never had - the "picked a recipe into a meal that already
   * held something" case. Kept separate from `matches` rather than folded
   * into it: `matches` means exact equality everywhere else it's read (the
   * retro-update eligibility checks in recipes.ts use mealMatchesRecipe
   * directly for that reason), so redefining it here would make it lie about
   * what it says on this one call site. This field exists only to let the
   * divergence line tell "added to it" apart from genuine drift. */
  recipeIsSubset: boolean;
  /** Whether any item is still a lazy-track guess. Derived: swapping every
   * guess for a real product clears it. */
  isAiEstimate: boolean;
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
  /** Null for an ordinary meal, and for a meal whose recipe was deleted - the
   * food stays, the link does not. */
  recipe: MealRecipeLink | null;
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
  nutritionOrigin: string;
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
  nutritionOrigin: products.nutritionOrigin,
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
  isAiEstimate: row.nutritionOrigin === AI_ESTIMATE_ORIGIN,
});

// Upper bound is read back in SQL, not bound as a JS value: Postgres keeps
// microsecond precision but a JS Date only carries milliseconds, so a
// rebound createdAt could exclude the meal from its own count.
const mealNumberInLocalDay = async (
  userId: string,
  mealId: string,
  logDate: string,
): Promise<number> => {
  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(meals)
    .where(
      and(
        eq(meals.userId, userId),
        eq(meals.logDate, logDate),
        isNull(meals.deletedAt),
        sql`${meals.createdAt} <= (select target.created_at from meals target where target.id = ${mealId})`,
      ),
    );
  return count;
};

export interface DayEnergy {
  consumedKcal: number;
  remaining: CalorieRemaining;
}

// Same day-wide figure the home hero shows for that date - goal minus every
// meal's kcal that day, not just this one.
const fetchDayEnergy = async (userId: string, logDate: string | SQL): Promise<DayEnergy> => {
  const [dayRows, calorieGoal] = await Promise.all([
    fetchDayMealIngredientRows(userId, logDate),
    fetchCalorieGoal(userId),
  ]);
  const consumedKcal = toDayMealSummaries(dayRows).reduce((sum, summary) => sum + summary.total.energyKcal, 0);
  return { consumedKcal, remaining: calorieRemaining(calorieGoal, consumedKcal) };
};

/** The meal's day kcal and what is left of the goal, without the rest of
 * getDayLog: the capture wizard's saved step shows these two figures and
 * nothing else. The day is read inside the same query, so the page runs this
 * beside getMealLogDate instead of after it. */
export const getMealDayEnergy = async (mealId: string): Promise<DayEnergy> => {
  const userId = await requireUserId();
  return fetchDayEnergy(
    userId,
    sql`(select target.log_date from meals target where target.id = ${mealId} and target.user_id = ${userId})`,
  );
};

/** The day a meal counts toward. A meal started on a past day is still open
 * to capture, so the wizard reads this rather than assuming today. */
export const getMealLogDate = async (mealId: string): Promise<string | null> => {
  const userId = await requireUserId();
  const [meal] = await db
    .select({ logDate: meals.logDate })
    .from(meals)
    .where(and(eq(meals.id, mealId), eq(meals.userId, userId), isNull(meals.deletedAt)));
  return meal?.logDate ?? null;
};

const fetchMealRecipeLink = async (
  userId: string,
  mealId: string,
  recipeId: string | null,
): Promise<MealRecipeLink | null> => {
  if (recipeId === null) {
    return null;
  }
  const recipe = await fetchOwnedRecipe(userId, recipeId);
  // A soft-deleted recipe reads as no recipe: deleteRecipe nulls the column
  // too, so this covers only the window between the two writes.
  if (!recipe) {
    return null;
  }
  const [mealRows, recipeItemRows, isAiEstimate] = await Promise.all([
    fetchMealItems(mealId),
    fetchRecipeItems(recipeId),
    recipeHasAiItems(recipeId),
  ]);
  return {
    id: recipe.id,
    name: recipe.name,
    matches: mealMatchesRecipe(mealRows, recipeItemRows),
    recipeIsSubset: recipeIsSubsetOfMeal(mealRows, recipeItemRows),
    isAiEstimate,
  };
};

export const getMealDetail = async (mealId: string): Promise<MealDetail | null> => {
  const userId = await requireUserId();
  // The rows read keys on mealId alone, so it runs beside the ownership read;
  // nothing from it leaves this function unless that read finds the meal.
  const [[meal], rows] = await Promise.all([
    db
      .select({ id: meals.id, logDate: meals.logDate, recipeId: meals.recipeId })
      .from(meals)
      .where(and(eq(meals.id, mealId), eq(meals.userId, userId), isNull(meals.deletedAt))),
    fetchMealIngredientRows(userId, mealId),
  ]);
  if (!meal) {
    return null;
  }

  const ingredients = rows.map(toMealIngredientDetail);
  const total = ingredients.reduce((sum, ingredient) => addNutrition(sum, ingredient.contribution), ZERO_NUTRITION);
  const [mealNumber, dayCalorieRemaining, recipe] = await Promise.all([
    mealNumberInLocalDay(userId, meal.id, meal.logDate),
    fetchDayEnergy(userId, meal.logDate).then((energy) => energy.remaining),
    fetchMealRecipeLink(userId, meal.id, meal.recipeId),
  ]);
  return {
    id: meal.id,
    mealNumber,
    date: meal.logDate,
    ingredients,
    total,
    dayCalorieRemaining,
    recipe,
  };
};

// Removal and deletion are soft so the UI can offer undo instead of a
// "this can't be undone" confirm. sweepEmptyMeals hard-deletes them later.
const setMealIngredientDeletedAt = async (mealIngredientId: string, deletedAt: SQL | null): Promise<void> => {
  const userId = await requireUserId();
  await assertMealIngredientOwnership(mealIngredientId, userId);
  await db.update(mealIngredients).set({ deletedAt }).where(eq(mealIngredients.id, mealIngredientId));
  refresh();
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

// Refreshes; deleteMeal does not. The delete navigates away straight after,
// and a refresh would first repaint the meal page as "not found".
export const restoreMeal = async (mealId: string): Promise<void> => {
  await setMealDeletedAt(mealId, null);
  refresh();
};

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
  refresh();
};

export type PasteIngredientsResult =
  | { kind: "pasted"; count: number }
  | { kind: "meal_missing" }
  | { kind: "unavailable"; productIds: string[] }
  | { kind: "invalid" };

/**
 * Writes copied rows into a meal, all or none. Every refusal writes nothing,
 * so the client can drop what failed and offer the rest again.
 *
 * Products gate on visibility, never on notAiEstimate: the user's own
 * lazy-track rows are theirs to reuse (spec §6), and nobody else's AI row
 * passes visibility at all.
 */
export const pasteIngredients = async (
  mealId: string,
  items: readonly PasteItem[],
): Promise<PasteIngredientsResult> => {
  const userId = await requireUserId();
  if (!isUuid(mealId) || !isValidPasteItems(items)) {
    return { kind: "invalid" };
  }
  const [meal, unavailableIds] = await Promise.all([
    fetchOwnedMeal(userId, mealId),
    fetchUnavailableProductIds(userId, items.map((item) => item.productId)),
  ]);
  if (!meal) {
    refresh();
    return { kind: "meal_missing" };
  }
  if (unavailableIds.length > 0) {
    return { kind: "unavailable", productIds: unavailableIds };
  }
  const count = await db.transaction((tx) => appendItemsToMeal(tx, mealId, items));
  refresh();
  return { kind: "pasted", count };
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
  offset: number,
  limit: number,
): Promise<DayHistoryRow[]> => {
  const result = await db.execute<DayHistoryRow>(sql`
    SELECT m.log_date AS local_date,
           SUM(coalesce(o.energy_kcal, p.energy_kcal) * (mi.quantity / p.nutrition_basis_quantity)) AS total_kcal
    FROM meal_ingredients mi
    JOIN meals m ON m.id = mi.meal_id
    JOIN products p ON p.id = mi.product_id
    ${overrideJoinSql("p", "o", userId)}
    WHERE m.user_id = ${userId}
      AND m.deleted_at IS NULL
      AND mi.deleted_at IS NULL
    GROUP BY m.log_date
    ORDER BY m.log_date DESC
    LIMIT ${limit} OFFSET ${offset}
  `);
  return result.rows;
};

const historyLimit = (pageCount: number): number =>
  HISTORY_PAGE_SIZE * Math.min(Math.max(Math.trunc(pageCount) || 1, 1), MAX_HISTORY_PAGES);

// pageCount > 1 only on a reload of a list "Load more" had already deepened.
export const getDayHistory = async (offset: number = 0, pageCount: number = 1): Promise<DayHistoryPage> => {
  const userId = await requireUserId();
  const limit = historyLimit(pageCount);
  const [rows, calorieGoal] = await Promise.all([
    fetchDayHistoryRows(userId, offset, limit),
    fetchCalorieGoal(userId),
  ]);
  const entries = rows.map((row) => ({
    date: toLocalDateString(row.local_date),
    totalKcal: Number(row.total_kcal),
  }));

  return {
    entries,
    nextOffset: entries.length === limit ? offset + limit : null,
    calorieGoal,
  };
};
