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
 */
export const findPhotoOwner = async (
  photoKeys: readonly string[],
  userId: string,
): Promise<PhotoOwner | null> => {
  const keys = sql`ANY(ARRAY[${sql.join(photoKeys.map((key) => sql`${key}`), sql`, `)}]::text[])`;
  const result = await db.execute<{ name: string | null }>(sql`
    SELECT CASE WHEN ${visibleToUser(userId)} THEN p.name ELSE NULL END AS name
    FROM products p
    WHERE p.nutrition_photo_key = ${keys}
    UNION ALL
    SELECT NULL AS name
    FROM product_overrides o
    WHERE o.nutrition_photo_key = ${keys}
    LIMIT 1
  `);
  return result.rows[0] ?? null;
};
