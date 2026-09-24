import { index, numeric, pgTable, smallint, text, timestamp, uuid } from "drizzle-orm/pg-core";

import { users } from "./auth";
import { products } from "./nutrition";

// The same precision every amount column in the app uses (nutrition.ts's
// nutritionColumn), so a quantity copied between meal_ingredients and
// recipe_items round-trips with no rounding step in between.
const AMOUNT_COLUMN_PRECISION = 10;
const AMOUNT_COLUMN_SCALE = 2;

const amountColumn = (columnName: string) =>
  numeric(columnName, { precision: AMOUNT_COLUMN_PRECISION, scale: AMOUNT_COLUMN_SCALE });

// A meal the user saved to re-add later, private to that user. No nutrition
// columns at all: every total is read live through effectiveNutrition, so a
// corrected label figure or a per-user override moves every recipe with no
// migration and no backfill.
//
// No unique constraint on (user_id, name): two recipes called "Oats" are the
// user's business, and a uniqueness error at the save prompt is a wall where
// the user wanted a save.
export const recipes = pgTable(
  "recipes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    name: text("name").notNull(),
    // Lowercase-ASCII form of `name` (toSearchText), notNull with no default
    // for the same reason products.name_search is: a writer that forgets it
    // should fail at compile time rather than file a recipe nobody can find.
    // renameRecipe rewrites both columns together.
    nameSearch: text("name_search").notNull(),
    // What the picker orders by, so the recipe eaten daily sits on top with no
    // management. Defaults to now() rather than null: a recipe saved a second
    // ago has been used, and a null would sort it last on its first render.
    lastUsedAt: timestamp("last_used_at").defaultNow().notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    // Soft delete, like meals.deleted_at: deleteRecipe nulls meals.recipe_id
    // rather than cascading, so a logged meal never loses food because a
    // recipe went away.
    deletedAt: timestamp("deleted_at"),
  },
  (table) => [index("recipes_user_last_used_idx").on(table.userId, table.lastUsedAt.desc())],
);

// One ingredient of one recipe. Mirrors meal_ingredients' amount columns,
// entry echo included, so "1 slice" is still "1 slice" on re-entry and
// recentAmounts keeps working.
export const recipeItems = pgTable("recipe_items", {
  id: uuid("id").primaryKey().defaultRandom(),
  recipeId: uuid("recipe_id")
    .notNull()
    .references(() => recipes.id),
  productId: uuid("product_id")
    .notNull()
    .references(() => products.id),
  quantity: amountColumn("quantity").notNull(),
  // Re-read from the product at entry time rather than trusted from here -
  // the same call-site enforcement saveMealIngredient makes. Stored anyway so
  // the picker can price a recipe without joining for the basis unit.
  quantityUnit: text("quantity_unit").notNull().default("g"),
  entryCount: amountColumn("entry_count"),
  entryUnit: text("entry_unit"),
  position: smallint("position").notNull(),
});
