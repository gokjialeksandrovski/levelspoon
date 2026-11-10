import { sql } from "drizzle-orm";

import { db } from ".";

interface PhotoDebtEntry {
  productId: string;
  productName: string;
  /** The stored proof the correction screen compares against. */
  originalPhotoKey: string | null;
  /** The most recent claim. Earlier ones no longer exist - each user keeps
   * only their latest, and a superseded object is deleted at write time. */
  claimedPhotoKey: string;
  claimCount: number;
  latestClaimAt: Date;
}

type PhotoDebtRow = {
  product_id: string;
  product_name: string;
  original_photo_key: string | null;
  claimed_photo_key: string;
  claim_count: number;
  latest_claim_at: Date;
};

/**
 * Products some user says have been reformulated, for a human to check.
 *
 * GROUP BY p.id is the "one entry per product" rule - not a read-then-append
 * check against the previous file, which two users submitting at once can lose,
 * and what it would lose is an unreviewed photo. Derived means the file is
 * disposable: delete it, regenerate it, same content.
 */
export const fetchPhotoDebt = async (): Promise<PhotoDebtEntry[]> => {
  const result = await db.execute<PhotoDebtRow>(sql`
    SELECT p.id AS product_id,
           p.name AS product_name,
           p.nutrition_photo_key AS original_photo_key,
           (array_agg(o.nutrition_photo_key ORDER BY o.updated_at DESC))[1] AS claimed_photo_key,
           count(*)::int AS claim_count,
           max(o.updated_at) AS latest_claim_at
    FROM product_overrides o
    JOIN products p ON p.id = o.product_id
    WHERE o.nutrition_photo_key IS NOT NULL
    GROUP BY p.id, p.name, p.nutrition_photo_key
    ORDER BY latest_claim_at DESC
  `);
  return result.rows.map((row) => ({
    productId: row.product_id,
    productName: row.product_name,
    originalPhotoKey: row.original_photo_key,
    claimedPhotoKey: row.claimed_photo_key,
    claimCount: row.claim_count,
    latestClaimAt: row.latest_claim_at,
  }));
};
