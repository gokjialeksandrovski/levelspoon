import { date, index, numeric, pgEnum, pgTable, primaryKey, text, timestamp, uuid } from "drizzle-orm/pg-core";

import { users } from "./auth";

export const quantitySourceEnum = pgEnum("quantity_source", ["ai_estimated", "manual"]);

export const productSource = pgEnum("product_source", ["user", "standard"]);

// "whole" = a whole food shown in the no-label search step.
// "fat" = a cooking oil/butter/spray, the meal-detail cooking-materials filter.
// Null on user rows. (spec §5 — not in the §4 table; added because §6's
// searchStandardFoods category filter needs a stored column.)
export const productCategory = pgEnum("product_category", ["whole", "fat"]);

// ODbL (OFF's license) requires derived-database share-alike; keeping
// OFF-sourced rows distinguishable is the only way to separate them later
// if any data-sharing deal ever needs it (spec §3).
export const nutritionOriginEnum = pgEnum("nutrition_origin", ["label_photo", "manual", "open_food_facts"]);

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
    // Lowercase-ASCII form of `name`, written by every insert (toSearchText)
    // so a name in any script is reachable from a Latin keyboard. No default:
    // a writer that forgets it should fail, not file a row nobody can find.
    nameSearch: text("name_search").notNull(),
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
    // The key is the content hash (lib/db/photo-keys.ts), so uniqueness here IS
    // the rule that one label photo belongs to one product (spec §3). NULL stays
    // legal and repeatable - standard rows and Open Food Facts rows have no photo.
    nutritionPhotoKey: text("nutrition_photo_key").unique(),
    nutritionOrigin: nutritionOriginEnum("nutrition_origin").notNull().default("label_photo"),
    createdByUserId: uuid("created_by_user_id")
      .notNull()
      .references(() => users.id),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedByUserId: uuid("updated_by_user_id").references(() => users.id),
    updatedAt: timestamp("updated_at"),
  },
  (table) => [
    index("products_name_trgm_idx").using("gin", table.name.op("gin_trgm_ops")),
    index("products_name_search_trgm_idx").using("gin", table.nameSearch.op("gin_trgm_ops")),
  ],
);

// One user's correction to one product, kept off the canonical row so the
// label-photo original survives untouched and "use the original values" is a
// single DELETE rather than a data migration. Composite PK, not a surrogate id:
// a user has at most one live correction per product, and the second edit
// replaces the first (docs/DECISIONS.md, 2026-09-17).
//
// No name column: a rename still lands on the shared row, and only for the user
// who created it - see renameOwnProduct.
export const productOverrides = pgTable(
  "product_overrides",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id),
    energyKcal: nutritionColumn("energy_kcal"),
    fatG: nutritionColumn("fat_g"),
    saturatesG: nutritionColumn("saturates_g"),
    carbohydrateG: nutritionColumn("carbohydrate_g"),
    sugarsG: nutritionColumn("sugars_g"),
    proteinG: nutritionColumn("protein_g"),
    saltG: nutritionColumn("salt_g"),
    // A photo of a label the user says has been reformulated. A claim, not
    // proof: nobody has checked it, so it never touches products.nutrition_
    // photo_key, which is what the correction screen compares against and what
    // the visibility rule (spec §S2) trusts. Null on an ordinary correction.
    nutritionPhotoKey: text("nutrition_photo_key").unique(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [primaryKey({ columns: [table.userId, table.productId] })],
);

// One user's gram figure for one named portion of one product: "a slice of
// THIS bread is 32 g". Kept off the product row for the same reason
// product_overrides is - the shared cross-user row stays what the label and
// the curated table say, and reverting is one DELETE rather than a data
// migration.
//
// Composite PK including the label: a product can have several portions
// ("slice", "slice, large"), and a second edit of the same one replaces the
// first. No surrogate id - there is nothing to reference a row by.
//
// Past meals are unaffected by design: meal_ingredients stores grams already
// resolved, so an edit moves future entries only.
export const portionOverrides = pgTable(
  "portion_overrides",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id),
    /** Matches Portion.label in app/src/lib/measures/portions.ts exactly. */
    portionLabel: text("portion_label").notNull(),
    grams: numeric("grams", {
      precision: NUTRITION_COLUMN_PRECISION,
      scale: NUTRITION_COLUMN_SCALE,
    }).notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [primaryKey({ columns: [table.userId, table.productId, table.portionLabel] })],
);

export const meals = pgTable("meals", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id),
  name: text("name"),
  // The local calendar day this meal counts towards, as the browser read it
  // when the meal was started - not derived from createdAt, so a meal logged
  // after midnight for the evening before lands on the day the user means.
  // notNull with no default, same reasoning as products.nameSearch: a
  // forgotten insert fails at compile time rather than filing a meal on the
  // server's UTC day.
  logDate: date("log_date").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  // Soft delete, so "Delete meal" can offer undo; purged by createMeal's sweep.
  deletedAt: timestamp("deleted_at"),
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
  // What the user actually said, beside what it resolved to. "1 slice" and
  // "28 g" are the same row: `quantity` is what every nutrition read scales
  // from, these two are what the screen shows back and what "recent amounts"
  // reads. Nullable with no backfill - a row written before this existed
  // still means exactly what it meant.
  entryCount: numeric("entry_count", {
    precision: NUTRITION_COLUMN_PRECISION,
    scale: NUTRITION_COLUMN_SCALE,
  }),
  entryUnit: text("entry_unit"),
  quantitySource: quantitySourceEnum("quantity_source").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  // Soft delete, same undo reason as meals.deletedAt.
  deletedAt: timestamp("deleted_at"),
});
