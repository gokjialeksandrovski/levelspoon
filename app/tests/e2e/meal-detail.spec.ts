// app/tests/e2e/meal-detail.spec.ts
import { expect, test } from "@playwright/test";
import { sql } from "drizzle-orm";

import { db } from "../../src/lib/db";
import { products, users } from "../../src/lib/db/schema";

const freshEmail = () => `e2e-meal-${crypto.randomUUID()}@example.com`;

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

const logAnIngredient = async (page: import("@playwright/test").Page) => {
  await page.getByLabel("Meal name").fill("Breakfast");
  await page.getByRole("button", { name: "Start" }).click();
  await page.waitForURL(/\/meals\/[^/]+$/);
  await page.getByRole("button", { name: "Add ingredient" }).click();
  await page.getByLabel("Product photo").setInputFiles("tests/e2e/fixtures/confident-product.jpg");
  await page.getByLabel("Amount (g)").fill("200");
  await page.getByRole("button", { name: "Save ingredient" }).click();
  await expect(page.getByText("Ingredient saved.")).toBeVisible();
};

test("editing an ingredient's amount recalculates its contribution", async ({ page }) => {
  await seedConfidentProduct();
  await signUp(page);
  await logAnIngredient(page);

  await page.getByRole("button", { name: "Edit" }).click();
  await page.getByLabel("Amount (g)").fill("100");
  await page.getByRole("button", { name: "Save" }).click();

  // Scoped to the ingredient row's own "<qty>g · <kcal> kcal" text - a bare
  // /70 kcal/ also matches the day-total bar and the meal-total line, both of
  // which coincidentally show the same figure for this single-ingredient meal.
  await expect(page.getByText("100g · 70 kcal")).toBeVisible();
});

test("removing an ingredient takes it off the meal", async ({ page }) => {
  await seedConfidentProduct();
  await signUp(page);
  await logAnIngredient(page);

  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Remove" }).click();

  await expect(page.getByText("Olympus Greek Yogurt 2% Fat")).toHaveCount(0);
});
