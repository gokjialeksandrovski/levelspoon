// No "use server": takes a userId, so as a Server Action it would let a
// browser file products under any user. Same rule as recipes.store.ts.
import type { DbTransaction } from "@/lib/db";
import { AI_ESTIMATE_ORIGIN, products } from "@/lib/db/schema";
import { toSearchText } from "@/lib/db/search-text";

import type { LoggedItem } from "./lazy-track.utils";

/** One private row per guessed item, ids in input order. No photo, no barcode,
 * source 'user': the products_ai_estimate_private CHECK holds all three. */
export const insertAiProducts = async (tx: DbTransaction, userId: string, items: readonly LoggedItem[]): Promise<string[]> => {
  const rows = await tx
    .insert(products)
    .values(
      items.map((item) => ({
        name: item.name,
        nameSearch: toSearchText(item.name),
        energyKcal: String(item.per100g.energyKcal),
        fatG: String(item.per100g.fatG),
        saturatesG: String(item.per100g.saturatesG),
        carbohydrateG: String(item.per100g.carbohydrateG),
        sugarsG: String(item.per100g.sugarsG),
        proteinG: String(item.per100g.proteinG),
        saltG: String(item.per100g.saltG),
        fibreG: item.per100g.fibreG === null ? null : String(item.per100g.fibreG),
        nutritionOrigin: AI_ESTIMATE_ORIGIN,
        createdByUserId: userId,
      })),
    )
    .returning({ id: products.id });
  return rows.map((row) => row.id);
};
