import type { Page } from "@playwright/test";
import { sql } from "drizzle-orm";

import { db } from "../../src/lib/db";
import { products, users } from "../../src/lib/db/schema";
import { todayLocalDateString } from "../../src/lib/date/day-bounds";

export const freshEmail = (prefix = "e2e") => `${prefix}-${crypto.randomUUID()}@example.com`;

export const localToday = () =>
  todayLocalDateString(Intl.DateTimeFormat().resolvedOptions().timeZone);

export const truncateAll = () =>
  db.execute(sql`TRUNCATE TABLE products, meal_ingredients, meals, "user" CASCADE`);

export const BASE_NUTRITION = {
  energyKcal: "70", fatG: "2.0", saturatesG: "1.2", carbohydrateG: "4.0",
  sugarsG: "4.0", proteinG: "9.0", saltG: "0.18", nutritionPhotoKey: "test/placeholder.jpg",
};

export const seedConfidentProduct = async (name = "Olympus Greek Yogurt 2% Fat") => {
  const [user] = await db.insert(users).values({ email: freshEmail("seed") }).returning();
  await db.insert(products).values({ ...BASE_NUTRITION, name, createdByUserId: user.id });
};

export const seedAmbiguousVariants = async () => {
  const [user] = await db.insert(users).values({ email: freshEmail("seed") }).returning();
  await db.insert(products).values([
    { ...BASE_NUTRITION, name: "Olympus Greek Yogurt 2% Fat", createdByUserId: user.id },
    { ...BASE_NUTRITION, name: "Olympus Greek Yogurt 10% Fat", createdByUserId: user.id },
  ]);
};

// A product owned by an already-signed-up user, for tests that then build a
// backdated meal against it by hand (there is no UI path to one).
export const seedProductFor = async (userId: string, name = "Test Product") => {
  const [product] = await db
    .insert(products)
    .values({ ...BASE_NUTRITION, name, createdByUserId: userId })
    .returning();
  return product;
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
  await page.getByLabel("Password").fill("correct horse battery staple");
  await page.getByRole("button", { name: "Sign up" }).click();
  await page.waitForURL(/\/day\//);
  return email;
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
