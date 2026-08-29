// app/tests/e2e/product-correction.spec.ts
import { expect, test } from "@playwright/test";
import { sql } from "drizzle-orm";

import { db } from "../../src/lib/db";
import { products, users } from "../../src/lib/db/schema";

const freshEmail = () => `e2e-correct-${crypto.randomUUID()}@example.com`;

test.beforeEach(async () => {
  await db.execute(sql`TRUNCATE TABLE products, meal_ingredients, meals, "user" CASCADE`);
});

const seedConfidentProduct = async () => {
  const [user] = await db.insert(users).values({ email: freshEmail() }).returning();
  await db.insert(products).values({
    name: "Olympus Greek Yogurt 2% Fat",
    energyKcal: "70", fatG: "2.0", saturatesG: "1.2", carbohydrateG: "4.0",
    sugarsG: "4.0", proteinG: "9.0", saltG: "0.18",
    nutritionPhotoKey: "test/placeholder.jpg", createdByUserId: user.id,
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

test("correcting a product from the meal detail page: an invalid value blocks save until fixed", async ({ page }) => {
  await seedConfidentProduct();
  await signUp(page);

  await page.getByLabel("Meal name").fill("Breakfast");
  await page.getByRole("button", { name: "Start" }).click();
  // Excludes "/meals/new" itself: that URL also satisfies a bare
  // /\/meals\/[^/]+$/ pattern, which would let this resolve before the
  // "Start" click's navigation to the newly-created meal ever completes.
  await page.waitForURL(/\/meals\/(?!new$)[^/]+$/);
  const mealUrl = page.url();

  await page.getByRole("button", { name: "Add ingredient" }).click();
  await page.getByLabel("Product photo").setInputFiles("tests/e2e/fixtures/confident-product.jpg");
  await page.getByLabel("Amount (g)").fill("200");
  await page.getByRole("button", { name: "Save ingredient" }).click();
  await expect(page.getByText("Ingredient saved.")).toBeVisible();

  await page.getByRole("link", { name: "Values look wrong?" }).click();
  await expect(page.getByRole("heading", { name: "Correct nutrition (per 100g)" })).toBeVisible();

  await page.getByLabel("Saturates (g)").fill("5");
  await page.getByLabel("Saturates (g)").blur();
  await expect(page.getByRole("button", { name: "Save correction" })).toBeDisabled();

  await page.getByLabel("Saturates (g)").fill("1.2");
  await page.getByLabel("Saturates (g)").blur();
  await expect(page.getByRole("button", { name: "Save correction" })).toBeEnabled();

  await page.getByRole("button", { name: "Save correction" }).click();
  await page.waitForURL(mealUrl);
});
