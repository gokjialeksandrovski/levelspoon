import { expect, test } from "@playwright/test";
import { sql } from "drizzle-orm";

import { db } from "../../src/lib/db";
import { products, users } from "../../src/lib/db/schema";

const freshEmail = () => `e2e-${crypto.randomUUID()}@example.com`;

test.beforeEach(async () => {
  await db.execute(sql`TRUNCATE TABLE products, meal_ingredients, meals, "user" CASCADE`);
});

const seedConfidentProduct = async () => {
  const [user] = await db.insert(users).values({ email: freshEmail() }).returning();
  await db.insert(products).values({
    name: "Olympus Greek Yogurt 2% Fat",
    energyKcal: "70",
    fatG: "2.0",
    saturatesG: "1.2",
    carbohydrateG: "4.0",
    sugarsG: "4.0",
    proteinG: "9.0",
    saltG: "0.18",
    nutritionPhotoKey: "test/placeholder.jpg",
    createdByUserId: user.id,
  });
};

const signUp = async (page: import("@playwright/test").Page) => {
  await page.goto("/signup");
  await page.getByLabel("Name").fill("E2E Tester");
  await page.getByLabel("Email").fill(freshEmail());
  await page.getByLabel("Password").fill("correct horse battery staple");
  await page.getByRole("button", { name: "Sign up" }).click();
  await page.waitForURL("**/meals/new");
};

test("happy path: confident match through save updates the day total", async ({ page }) => {
  await seedConfidentProduct();
  await signUp(page);

  await page.getByRole("button", { name: "Start" }).click();
  await page.waitForURL(/\/meals\/[^/]+$/);
  await page.getByRole("button", { name: "Add ingredient" }).click();

  await page.getByLabel("Product photo").setInputFiles("tests/e2e/fixtures/confident-product.jpg");
  await expect(page.getByText("Using Olympus Greek Yogurt 2% Fat")).toBeVisible();

  await page.getByLabel("Amount (g)").fill("200");
  await page.getByRole("button", { name: "Save ingredient" }).click();

  await expect(page.getByText("Ingredient saved.")).toBeVisible();
  // Matched loosely (/140 kcal/) this also hits the new ingredient row and
  // "Meal total" line that Task 4 added to the page, both showing the same
  // value for a single-ingredient meal - scope to the day-total bar's own
  // "Today: " prefix so this stays a check on the day total, per the test name.
  await expect(page.getByText(/Today: 140 kcal/)).toBeVisible();
});

const seedAmbiguousVariants = async () => {
  const [user] = await db.insert(users).values({ email: freshEmail() }).returning();
  const base = {
    energyKcal: "70",
    fatG: "2.0",
    saturatesG: "1.2",
    carbohydrateG: "4.0",
    sugarsG: "4.0",
    proteinG: "9.0",
    saltG: "0.18",
    nutritionPhotoKey: "test/placeholder.jpg",
    createdByUserId: user.id,
  };
  await db.insert(products).values([
    { ...base, name: "Olympus Greek Yogurt 2% Fat" },
    { ...base, name: "Olympus Greek Yogurt 10% Fat" },
  ]);
};

test("ambiguous match: picking a candidate proceeds to the amount step", async ({ page }) => {
  await seedAmbiguousVariants();
  await signUp(page);

  await page.getByRole("button", { name: "Start" }).click();
  await page.waitForURL(/\/meals\/[^/]+$/);
  await page.getByRole("button", { name: "Add ingredient" }).click();

  await page.getByLabel("Product photo").setInputFiles("tests/e2e/fixtures/ambiguous-product.jpg");
  await expect(page.getByText("Which product is this?")).toBeVisible();

  await page.getByRole("button", { name: "Olympus Greek Yogurt 2% Fat" }).click();
  await expect(page.getByText("Using Olympus Greek Yogurt 2% Fat")).toBeVisible();
});

test("no match: creating a new product proceeds to the amount step", async ({ page }) => {
  await signUp(page);

  await page.getByRole("button", { name: "Start" }).click();
  await page.waitForURL(/\/meals\/[^/]+$/);
  await page.getByRole("button", { name: "Add ingredient" }).click();

  await page.getByLabel("Product photo").setInputFiles("tests/e2e/fixtures/no-match-product.jpg");
  await page.getByLabel("Nutrition table photo").setInputFiles("tests/e2e/fixtures/nutrition-valid.jpg");

  await expect(page.getByText("Confirm nutrition (per 100g)")).toBeVisible();
  await page.getByRole("button", { name: "Save product" }).click();

  await expect(page.getByText(/^Using /)).toBeVisible();
});
