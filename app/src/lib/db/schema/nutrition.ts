import { index, numeric, pgEnum, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

import { users } from "./auth";

export const quantitySourceEnum = pgEnum("quantity_source", ["ai_estimated", "manual"]);

export const productSource = pgEnum("product_source", ["user", "standard"]);

// "whole" = a whole food shown in the no-label search step.
// "fat" = a cooking oil/butter/spray, the meal-detail cooking-materials filter.
// Null on user rows. (spec §5 — not in the §4 table; added because §6's
// searchStandardFoods category filter needs a stored column.)
export const productCategory = pgEnum("product_category", ["whole", "fat"]);

const NUTRITION_COLUMN_PRECISION = 10;
const NUTRITION_COLUMN_SCALE = 2;

const nutritionColumn = (columnName: string) =>
  numeric(columnName, { precision: NUTRITION_COLUMN_PRECISION, scale: NUTRITION_COLUMN_SCALE }).notNull();

// A density needs four decimals: a "2 Tbsp (37g)" label states 1.2333 g/mL,
// and rounding to two would move a 240 mL cup by nearly 8 g.
const DENSITY_COLUMN_PRECISION = 6;
const DENSITY_COLUMN_SCALE = 4;

export const products = pgTable(
  "products",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    brand: text("brand"),
    source: productSource("source").notNull().default("user"),
    standardSlug: text("standard_slug").unique(),
    standardCategory: productCategory("standard_category"),
    energyKcal: nutritionColumn("energy_kcal"),
    fatG: nutritionColumn("fat_g"),
    saturatesG: nutritionColumn("saturates_g"),
    carbohydrateG: nutritionColumn("carbohydrate_g"),
    sugarsG: nutritionColumn("sugars_g"),
    proteinG: nutritionColumn("protein_g"),
    saltG: nutritionColumn("salt_g"),
    // Generalizes "per 100g": every nutrition column above means "per
    // nutritionBasisQuantity of nutritionBasisUnit." Defaults preserve
    // today's meaning for every existing row - a free migration, no backfill.
    nutritionBasisUnit: text("nutrition_basis_unit").notNull().default("g"),
    nutritionBasisQuantity: numeric("nutrition_basis_quantity", {
      precision: NUTRITION_COLUMN_PRECISION,
      scale: NUTRITION_COLUMN_SCALE,
    }).notNull().default("100"),
    // All three are learned at runtime and null until then: a density derived
    // from a label that printed both a volume and a weight, or the weight of
    // one count unit ("1 bar") the user supplied once.
    densityGMl: numeric("density_g_ml", {
      precision: DENSITY_COLUMN_PRECISION,
      scale: DENSITY_COLUMN_SCALE,
    }),
    servingUnit: text("serving_unit"),
    servingGrams: numeric("serving_grams", {
      precision: NUTRITION_COLUMN_PRECISION,
      scale: NUTRITION_COLUMN_SCALE,
    }),
    // Null on standard rows — they have no label photo. (spec §4)
    nutritionPhotoKey: text("nutrition_photo_key"),
    createdByUserId: uuid("created_by_user_id")
      .notNull()
      .references(() => users.id),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedByUserId: uuid("updated_by_user_id").references(() => users.id),
    updatedAt: timestamp("updated_at"),
  },
  (table) => [
    index("products_name_trgm_idx").using("gin", table.name.op("gin_trgm_ops")),
  ],
);

export const meals = pgTable("meals", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id),
  name: text("name"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const mealIngredients = pgTable("meal_ingredients", {
  id: uuid("id").primaryKey().defaultRandom(),
  mealId: uuid("meal_id")
    .notNull()
    .references(() => meals.id),
  productId: uuid("product_id")
    .notNull()
    .references(() => products.id),
  quantity: nutritionColumn("quantity"),
  // Always equals the product's nutritionBasisUnit - enforced at the
  // saveMealIngredient/updateMealIngredientQuantity call sites, not a DB
  // constraint (per-unit-nutrition-basis-design spec §9).
  quantityUnit: text("quantity_unit").notNull().default("g"),
  quantitySource: quantitySourceEnum("quantity_source").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
