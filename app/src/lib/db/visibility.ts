import { sql } from "drizzle-orm";

/**
 * Who may be offered this product.
 *
 * The products table is a cross-user cache, so a row another user is offered
 * has to be checkable by someone other than whoever typed it: a stored label
 * photo, or a barcode that resolves to one. A row with neither is real and
 * logged like any other - it is just nobody else's business.
 *
 * Derived, not stored: linkBarcode attaches a barcode to an already-created
 * product, so a persisted flag would need keeping in step there too. This way
 * the row is promoted the moment the barcode lands.
 *
 * Expects the products table aliased as `p`.
 *
 * Lives in lib/db, not in the products action: a `'use server'` file exports
 * only async functions, and the reuse probe (spec §4) needs this fragment too.
 */
export const visibleToUser = (userId: string) => sql`
  (p.nutrition_photo_key IS NOT NULL
   OR p.created_by_user_id = ${userId}
   OR EXISTS (SELECT 1 FROM product_barcodes b WHERE b.product_id = p.id))
`;
