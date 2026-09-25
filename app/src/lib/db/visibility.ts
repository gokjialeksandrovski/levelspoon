import { eq, sql } from "drizzle-orm";

import { db } from ".";
import { AI_ESTIMATE_ORIGIN, products } from "./schema";
import { AiEstimateNotEditableError } from "./ai-estimate-errors";

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

/**
 * Keeps lazy-track guesses out of every search, match and gate. An AI row is
 * private by visibleToUser already; this also hides it from its own author,
 * who reuses it through a recipe, never by typing its name.
 *
 * Expects the products table aliased as `p`.
 */
export const notAiEstimate = sql`p.nutrition_origin <> 'ai_estimate'`;

/**
 * Refuses an edit meant for a real product when aimed at a lazy-track guess.
 * A barcode link or a portion weight both imply someone measured this
 * product; an AI estimate never was, so either write would misrepresent it.
 * No UI path offers either action from a lazy-track row - this is the
 * backstop for a bug, not a user-facing refusal.
 */
export const assertNotAiEstimate = async (productId: string): Promise<void> => {
  const [row] = await db
    .select({ origin: products.nutritionOrigin })
    .from(products)
    .where(eq(products.id, productId));
  if (row?.origin === AI_ESTIMATE_ORIGIN) {
    throw new AiEstimateNotEditableError(productId);
  }
};
