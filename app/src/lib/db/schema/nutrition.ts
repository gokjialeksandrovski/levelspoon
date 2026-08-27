import { index, numeric, pgEnum, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

import { users } from "./auth";

export const quantitySourceEnum = pgEnum("quantity_source", ["ai_estimated", "manual"]);

const NUTRITION_COLUMN_PRECISION = 10;
const NUTRITION_COLUMN_SCALE = 2;

const nutritionColumn = (columnName: string) =>
  numeric(columnName, { precision: NUTRITION_COLUMN_PRECISION, scale: NUTRITION_COLUMN_SCALE }).notNull();

export const products = pgTable(
  "products",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    brand: text("brand"),
    energyKcal: nutritionColumn("energy_kcal"),
    fatG: nutritionColumn("fat_g"),
    saturatesG: nutritionColumn("saturates_g"),
    carbohydrateG: nutritionColumn("carbohydrate_g"),
    sugarsG: nutritionColumn("sugars_g"),
    proteinG: nutritionColumn("protein_g"),
    saltG: nutritionColumn("salt_g"),
    nutritionPhotoKey: text("nutrition_photo_key").notNull(),
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
  name: text("name").notNull(),
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
  quantityG: nutritionColumn("quantity_g"),
  quantitySource: quantitySourceEnum("quantity_source").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
