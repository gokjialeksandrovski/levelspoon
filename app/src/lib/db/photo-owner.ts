import { sql } from "drizzle-orm";

import { db } from ".";
import { visibleToUser } from "./visibility";

export interface PhotoOwner {
  /** Null when a row holds this photo but is not one this user may be shown -
   * naming it would leak another user's private product or private claim. */
  name: string | null;
}

/**
 * Which product, if any, already holds one of these photo keys.
 *
 * Both tables are searched: a proof photo on `products` and a reformulation
 * claim on `product_overrides` are the same forgery, and the photo-debt
 * reviewer trusts the claim image just as much (spec §4).
 *
 * The search itself ignores visibility - a private row's photo must not be
 * borrowable either, or the ban has a hole shaped like "create a throwaway
 * private product first". Visibility only decides whether the name comes back.
 *
 * `nutrition_photo_key` carries its own independent UNIQUE index on each
 * table, not a cross-table one, so the same key string could in principle
 * match a row in both at once. The two arms are read as separate scalar
 * subqueries rather than a `UNION ALL ... LIMIT 1` so that case has a fixed,
 * documented winner instead of an implementation-defined one: the `products`
 * arm wins whenever it matches, because it is the only arm that can ever name
 * an owner - falling through to the override arm there would turn a nameable
 * refusal into a generic one for no reason. Every write path that could create
 * a same-key row in both tables already refuses before either lands
 * (`assertPhotoUnused` in products.ts), so today this tie never actually
 * fires - but `findPhotoOwner` is a shared primitive other callers reach
 * directly, so its own result must not depend on that discipline holding.
 */
export const findPhotoOwner = async (
  photoKeys: readonly string[],
  userId: string,
): Promise<PhotoOwner | null> => {
  const keys = sql`ANY(ARRAY[${sql.join(photoKeys.map((key) => sql`${key}`), sql`, `)}]::text[])`;
  const [row] = (
    await db.execute<{ has_product: boolean; product_name: string | null; has_override: boolean }>(sql`
      SELECT
        EXISTS (SELECT 1 FROM products p WHERE p.nutrition_photo_key = ${keys}) AS has_product,
        (SELECT CASE WHEN ${visibleToUser(userId)} THEN p.name ELSE NULL END
         FROM products p WHERE p.nutrition_photo_key = ${keys}) AS product_name,
        EXISTS (SELECT 1 FROM product_overrides o WHERE o.nutrition_photo_key = ${keys}) AS has_override
    `)
  ).rows;
  if (row.has_product) {
    return { name: row.product_name };
  }
  if (row.has_override) {
    return { name: null };
  }
  return null;
};
