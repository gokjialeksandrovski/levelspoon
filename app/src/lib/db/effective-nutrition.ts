import { sql, type SQL } from "drizzle-orm";

import { productOverrides, products } from "./schema";

/**
 * What a given user should see for a product's seven nutrition figures: their
 * own correction if they have one, the canonical label-photo row otherwise.
 *
 * Lives here, in one place, because six read sites need it - two meal
 * selections, two candidate searches, the barcode lookup and the correction
 * screen - and seven hand-written coalesces per site is how they drift apart.
 *
 * Two shapes because the call sites are two shapes: meals.ts builds typed
 * Drizzle selections, products.ts and barcode.ts write raw SQL against
 * snake_case column names.
 */
export const effectiveNutritionSelection = () => ({
  energyKcal: sql<string>`coalesce(${productOverrides.energyKcal}, ${products.energyKcal})`,
  fatG: sql<string>`coalesce(${productOverrides.fatG}, ${products.fatG})`,
  saturatesG: sql<string>`coalesce(${productOverrides.saturatesG}, ${products.saturatesG})`,
  carbohydrateG: sql<string>`coalesce(${productOverrides.carbohydrateG}, ${products.carbohydrateG})`,
  sugarsG: sql<string>`coalesce(${productOverrides.sugarsG}, ${products.sugarsG})`,
  proteinG: sql<string>`coalesce(${productOverrides.proteinG}, ${products.proteinG})`,
  saltG: sql<string>`coalesce(${productOverrides.saltG}, ${products.saltG})`,
});

const NUTRITION_COLUMN_NAMES = [
  "energy_kcal",
  "fat_g",
  "saturates_g",
  "carbohydrate_g",
  "sugars_g",
  "protein_g",
  "salt_g",
] as const;

// Aliases are identifiers, not values, so they cannot be bound as parameters.
// Every call site passes a literal from this module's own callers - never user
// input - but the guard keeps it that way.
const assertSafeAlias = (alias: string): void => {
  if (!/^[a-z][a-z0-9_]*$/.test(alias)) {
    throw new Error(`Unsafe SQL alias: ${alias}`);
  }
};

export const effectiveNutritionSql = (productAlias: string, overrideAlias: string): SQL => {
  assertSafeAlias(productAlias);
  assertSafeAlias(overrideAlias);
  const columns = NUTRITION_COLUMN_NAMES.map(
    (column) =>
      sql.raw(`coalesce(${overrideAlias}.${column}, ${productAlias}.${column}) AS ${column}`),
  );
  return sql.join(columns, sql`, `);
};

export const overrideJoinSql = (productAlias: string, overrideAlias: string, userId: string): SQL => {
  assertSafeAlias(productAlias);
  assertSafeAlias(overrideAlias);
  return sql`LEFT JOIN product_overrides ${sql.raw(overrideAlias)}
    ON ${sql.raw(`${overrideAlias}.product_id = ${productAlias}.id`)}
   AND ${sql.raw(`${overrideAlias}.user_id`)} = ${userId}`;
};
