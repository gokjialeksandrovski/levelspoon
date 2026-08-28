import { expect, test } from "@playwright/test";

import { db } from "../../src/lib/db";
import { products, users } from "../../src/lib/db/schema";

const freshEmail = () => `e2e-${crypto.randomUUID()}@example.com`;

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

  await page.getByLabel("Meal name").fill("Breakfast");
  await page.getByRole("button", { name: "Start" }).click();
  await page.waitForURL(/\/meals\/[^/]+$/);

  await page.getByLabel("Product photo").setInputFiles("tests/e2e/fixtures/confident-product.jpg");
  await expect(page.getByText("Using Olympus Greek Yogurt 2% Fat")).toBeVisible();

  await page.getByLabel("Amount (g)").fill("200");
  await page.getByRole("button", { name: "Save ingredient" }).click();

  await expect(page.getByText("Ingredient saved.")).toBeVisible();
  await expect(page.getByText(/140 kcal/)).toBeVisible();
});
