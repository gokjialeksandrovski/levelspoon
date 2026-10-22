import type { Page } from "@playwright/test";
import { sql } from "drizzle-orm";

import { db } from "../../src/lib/db";
import { toSearchText } from "../../src/lib/db/search-text";
import { productBarcodes, products, users } from "../../src/lib/db/schema";
import { todayLocalDateString } from "../../src/lib/date/day-bounds";
import { FIELD_LABELS } from "../../src/lib/ocr/nutrition-fields";
import type { FieldValues } from "../../src/lib/ocr/nutrition-fields";

export const freshEmail = (prefix = "e2e") => `${prefix}-${crypto.randomUUID()}@example.com`;

export const localToday = () =>
  todayLocalDateString(Intl.DateTimeFormat().resolvedOptions().timeZone);

export const truncateAll = () =>
  db.execute(sql`TRUNCATE TABLE recipe_items, recipes, products, meal_ingredients, meals, "user" CASCADE`);

export const BASE_NUTRITION = {
  energyKcal: "70", fatG: "2.0", saturatesG: "1.2", carbohydrateG: "4.0",
  sugarsG: "4.0", proteinG: "9.0", saltG: "0.18",
};

// A fresh key per row, not a shared literal: a content-addressed key means two
// rows sharing one string (e.g. seedAmbiguousVariants' pair, built in one call)
// collide on the column's UNIQUE constraint.
const productValues = (name: string, createdByUserId: string) => ({
  ...BASE_NUTRITION,
  nutritionPhotoKey: `test/${crypto.randomUUID()}.jpg`,
  name,
  nameSearch: toSearchText(name),
  createdByUserId,
});

export const seedConfidentProduct = async (name = "Olympus Greek Yogurt 2% Fat") => {
  const [user] = await db.insert(users).values({ email: freshEmail("seed") }).returning();
  await db.insert(products).values(productValues(name, user.id));
};

export const seedAmbiguousVariants = async () => {
  const [user] = await db.insert(users).values({ email: freshEmail("seed") }).returning();
  await db.insert(products).values([
    productValues("Olympus Greek Yogurt 2% Fat", user.id),
    productValues("Olympus Greek Yogurt 10% Fat", user.id),
  ]);
};

// A product owned by an already-signed-up user, for tests that then build a
// meal on some earlier day against it by hand, rather than walking the day bar
// back to it.
export const seedProductFor = async (userId: string, name = "Test Product") => {
  const [product] = await db
    .insert(products)
    .values(productValues(name, userId))
    .returning();
  return product;
};

// The e2e equivalent of barcode.test.ts's seedProduct - a product row
// with a product_barcodes row already pointing at it, for the internal_match
// wizard scenario.
export const seedProductWithBarcode = async (barcode: string, name = "Existing Scanned Product") => {
  const [user] = await db.insert(users).values({ email: freshEmail("seed") }).returning();
  const [product] = await db
    .insert(products)
    .values(productValues(name, user.id))
    .returning();
  await db.insert(productBarcodes).values({ barcode, productId: product.id, createdByUserId: user.id });
};

type StandardFoodOverrides = {
  servingUnit?: string | null;
  servingGrams?: string | null;
  category?: "whole" | "fat";
  densityGMl?: string | null;
  nutrition?: Partial<typeof BASE_NUTRITION>;
};

const standardFoodValues = (name: string, overrides: StandardFoodOverrides, createdByUserId: string) => ({
  ...BASE_NUTRITION,
  ...overrides.nutrition,
  name,
  nameSearch: toSearchText(name),
  nutritionPhotoKey: null,
  source: "standard" as const,
  standardSlug: `e2e-${crypto.randomUUID()}`,
  standardCategory: overrides.category ?? "whole",
  createdByUserId,
  servingUnit: overrides.servingUnit ?? null,
  servingGrams: overrides.servingGrams ?? null,
  densityGMl: overrides.densityGMl ?? null,
});

// A source='standard' row, like scripts/seed.ts's real fixture loader but
// without touching fixtures/standard-foods.json - each e2e test truncates
// products between runs (truncateAll), so a per-test seed is simpler than
// re-running the full fixture loader before every test.
export const seedStandardFood = async (name = "Banana", overrides: StandardFoodOverrides = {}) => {
  const [systemUser] = await db.insert(users).values({ email: freshEmail("system") }).returning();
  await db.insert(products).values(standardFoodValues(name, overrides, systemUser.id));
};

// Signing up lands on "/", which redirects to the local day view - so the
// wait targets /day/ rather than any one date string. Returns the email it
// used, for tests that need the created user's row afterward.
export const signUp = async (page: Page, email = freshEmail()) => {
  await page.goto("/signup");
  await page.getByLabel("Name").fill("E2E Tester");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill("correct horse battery staple");
  await page.getByRole("button", { name: "Sign up" }).click();
  await page.waitForURL(/\/day\//);
  return email;
};

// Manual-name entry, not the product-photo path: a typed name with no match
// in the freshly-truncated DB reaches nutrition-photo directly, which is the
// step callers of this helper actually want to drive.
export const startCapture = async (page: Page, name: string) => {
  await page.goto(`/day/${localToday()}`);
  await page.getByRole("button", { name: "New meal" }).click();
  await page.waitForURL(/\/meals\/[^/]+\/capture$/);
  await page.getByRole("button", { name: "Type a packaged product's name" }).click();
  await page.getByLabel("Product name").fill(name);
  await page.getByRole("button", { name: "Continue" }).click();
};

// The nutrition-photo step's own escape hatch for when no photo is taken -
// every field arrives blank and flagged, so this fills all seven rather than
// just the one a caller cares about (a flagged-but-empty field blocks Save).
export const enterNutritionManually = async (page: Page, figures: FieldValues) => {
  await page.getByRole("button", { name: "Enter the values manually" }).click();
  for (const field of Object.keys(FIELD_LABELS) as (keyof FieldValues)[]) {
    await page.getByLabel(FIELD_LABELS[field]).fill(figures[field]);
  }
};

// Inline bytes, not a fixture file: a photo key is a content hash
// (photo-keys.ts), so two products only collide on it when given the exact
// same bytes - a buffer literal keeps that shared identity visible at the
// call site instead of two callers pointing at "the same fixture" by convention.
export const uploadNutritionPhoto = async (page: Page, bytes: Buffer) => {
  await page.getByLabel(/nutrition table photo/i).setInputFiles({
    name: "label.jpg",
    mimeType: "image/jpeg",
    buffer: bytes,
  });
};

// New meal -> confident product photo -> 200g -> Save -> Done. Returns the
// meal detail URL it lands on. Exact-match { exact: true } for both "Product photo"
// and "Amount" labels to avoid substring collision with "Amount photo (optional)".
export const logOneIngredient = async (page: Page) => {
  await page.getByRole("button", { name: "New meal" }).click();
  await page.getByLabel("Product photo", { exact: true }).setInputFiles("tests/e2e/fixtures/confident-product.jpg");
  await page.getByLabel("Amount", { exact: true }).fill("200");
  await page.getByRole("button", { name: /save/i }).click();
  await page.getByRole("button", { name: /done/i }).click();
  await page.waitForURL(/\/meals\/[^/]+$/);
  return page.url();
};
