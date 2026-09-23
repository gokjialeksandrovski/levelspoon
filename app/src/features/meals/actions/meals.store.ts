// No "use server": every export takes a userId, and as a Server Action that
// would let a browser read any user's log. Only "use server" modules import
// this file (CLAUDE.md, "Server/client boundary"); they resolve the user
// themselves and hand it in. Reads take no DbTransaction, matching
// fetchLatestWeightKg in features/weight/actions/weight.store.ts.
import { and, eq, gte, isNull, lte, sql } from "drizzle-orm";

import { db } from "@/lib/db";
import { mealIngredients, meals, productOverrides, products } from "@/lib/db/schema";

export interface DailyKcal {
  /** The user's local calendar day, YYYY-MM-DD. */
  date: string;
  kcal: number;
}

/**
 * One row per local day that carries at least one live ingredient, from `from`
 * to `to` inclusive. A day with no meal produces no row at all - the caller
 * needs to tell an unlogged day from a zero-calorie one, and a zero row would
 * hide that difference.
 *
 * Bucketing happens here in JS rather than in a SQL GROUP BY, because summing
 * has to happen after each row is scaled and a scaled row is not a column.
 * Only the energy column is selected, since this is the one figure the
 * measured burn needs; meals.store.test.ts pins the result against getDayLog's
 * own total so the two scalings cannot drift apart.
 */
export const dailyKcalTotals = async (
  userId: string,
  from: string,
  to: string,
): Promise<DailyKcal[]> => {
  const rows = await db
    .select({
      logDate: meals.logDate,
      quantity: mealIngredients.quantity,
      basisQuantity: products.nutritionBasisQuantity,
      // The day total is this user's day, so it reads this user's corrections.
      energyKcal: sql<string>`coalesce(${productOverrides.energyKcal}, ${products.energyKcal})`,
    })
    .from(mealIngredients)
    .innerJoin(meals, eq(mealIngredients.mealId, meals.id))
    .innerJoin(products, eq(mealIngredients.productId, products.id))
    .leftJoin(
      productOverrides,
      and(eq(productOverrides.productId, products.id), eq(productOverrides.userId, userId)),
    )
    .where(
      and(
        eq(meals.userId, userId),
        isNull(meals.deletedAt),
        isNull(mealIngredients.deletedAt),
        gte(meals.logDate, from),
        lte(meals.logDate, to),
      ),
    );

  const byDate = new Map<string, number>();
  for (const row of rows) {
    const kcal = (Number(row.energyKcal) * Number(row.quantity)) / Number(row.basisQuantity);
    byDate.set(row.logDate, (byDate.get(row.logDate) ?? 0) + kcal);
  }
  return [...byDate].map(([date, kcal]) => ({ date, kcal }));
};
