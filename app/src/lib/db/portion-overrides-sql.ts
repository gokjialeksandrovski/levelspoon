import { sql, type SQL } from "drizzle-orm";

import { assertSafeAlias } from "./effective-nutrition";

/**
 * This user's own portion weights for one product row, as a JSON object of
 * label to grams.
 *
 * A correlated subquery, not a join: this table is one row PER LABEL, so a
 * LEFT JOIN would multiply a product with two overridden portions into two
 * search results. product_overrides can join because it is one row per
 * (user, product); this one cannot.
 */
export const portionOverridesJson = (productAlias: string, userId: string): SQL => {
  assertSafeAlias(productAlias);
  return sql`
    COALESCE(
      (SELECT jsonb_object_agg(po.portion_label, po.grams)
         FROM portion_overrides po
        WHERE ${sql.raw(`po.product_id = ${productAlias}.id`)} AND po.user_id = ${userId}),
      '{}'::jsonb
    ) AS portion_overrides
  `;
};
