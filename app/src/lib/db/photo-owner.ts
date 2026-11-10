import { sql } from "drizzle-orm";

import { db } from ".";
import { visibleToUser } from "./visibility";

interface PhotoOwner {
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
 * match a row in both at once - the `products` arm wins whenever it matches,
 * because it is the only arm that can ever name an owner. Each arm also has
 * its own `LIMIT 1`: a caller may pass keys from two different buffers, and an
 * un-limited scalar subquery matching more than one row raises rather than
 * returns.
 *
 * An override's own author is named, never anonymized: attaching a claim
 * photo to product X and then trying the same bytes on product Y is that
 * user's own row both times, and naming it leaks nothing they do not already
 * know. Only a different user's override stays anonymous.
 */
export const findPhotoOwner = async (
  photoKeys: readonly string[],
  userId: string,
): Promise<PhotoOwner | null> => {
  const keys = sql`ANY(ARRAY[${sql.join(photoKeys.map((key) => sql`${key}`), sql`, `)}]::text[])`;

  const [productRow] = (
    await db.execute<{ name: string | null }>(sql`
      SELECT CASE WHEN ${visibleToUser(userId)} THEN p.name ELSE NULL END AS name
      FROM products p
      WHERE p.nutrition_photo_key = ${keys}
      ORDER BY p.id
      LIMIT 1
    `)
  ).rows;
  if (productRow) {
    return { name: productRow.name };
  }

  const [overrideRow] = (
    await db.execute<{ user_id: string; name: string }>(sql`
      SELECT o.user_id, p.name
      FROM product_overrides o
      JOIN products p ON p.id = o.product_id
      WHERE o.nutrition_photo_key = ${keys}
      ORDER BY o.product_id
      LIMIT 1
    `)
  ).rows;
  if (overrideRow) {
    return { name: overrideRow.user_id === userId ? overrideRow.name : null };
  }

  return null;
};
