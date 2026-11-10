// No "use server": every export takes a userId, and as a Server Action that
// would let a browser read any user's log. Only "use server" modules import
// this file (CLAUDE.md, "Server/client boundary"); they resolve the user
// themselves and hand it in. Reads take no DbTransaction, matching
// fetchLatestWeightKg in features/weight/actions/weight.store.ts.
import { and, eq, gte, isNull, lte, sql } from "drizzle-orm";

import { db } from "@/lib/db";
import { mealIngredients, meals, productOverrides, products, productSource } from "@/lib/db/schema";
import { visibleToUser } from "@/lib/db/visibility";

// productSource.enumValues is the tuple ["user", "standard"].
const STANDARD_SOURCE = productSource.enumValues[1];

interface DailyKcal {
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

/**
 * The ids among `productIds` this user may not log: missing, or another
 * user's private row. Each id once, however often it was asked about.
 *
 * The standard clause is needed because curated rows belong to a system user
 * and carry no photo or barcode, so visibleToUser alone refuses a pasted
 * banana (spec §6 step 4). No notAiEstimate: the user's own lazy-track rows
 * pass visibleToUser by authorship and are pasteable; nobody else's can be.
 */
export const fetchUnavailableProductIds = async (
  userId: string,
  productIds: readonly string[],
): Promise<string[]> => {
  const distinctIds = [...new Set(productIds)];
  const result = await db.execute<{ id: string }>(sql`
    SELECT p.id FROM products p
    WHERE p.id IN (${sql.join(distinctIds.map((id) => sql`${id}`), sql`, `)})
      AND (p.source = ${STANDARD_SOURCE} OR ${visibleToUser(userId)})
  `);
  const available = new Set(result.rows.map((row) => row.id));
  return distinctIds.filter((id) => !available.has(id));
};
