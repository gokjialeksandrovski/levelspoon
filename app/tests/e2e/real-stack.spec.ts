import { expect, test } from "@playwright/test";
import { sql } from "drizzle-orm";

import { db } from "../../src/lib/db";

const freshEmail = () => `e2e-real-${crypto.randomUUID()}@example.com`;

// This local dev Postgres persists across runs (it's not re-created per
// suite), so without this the products table accumulates rows across
// sessions and pollutes matchProduct's global similarity search - the exact
// failure mode that already bit the tier-3 suite (capture-flow.spec.ts's
// beforeEach) before this same fix was applied there.
test.beforeEach(async () => {
  await db.execute(sql`TRUNCATE TABLE products, meal_ingredients, meals, "user" CASCADE`);
});

test("real stack: real photos through real OCR produce the golden nutrition values", async ({ page }) => {
  await page.goto("/signup");
  await page.getByLabel("Name").fill("Real Stack Tester");
  await page.getByLabel("Email").fill(freshEmail());
  await page.getByLabel("Password").fill("correct horse battery staple");
  await page.getByRole("button", { name: "Sign up" }).click();
  await page.waitForURL("**/meals/new");

  await page.getByLabel("Meal name").fill("Breakfast");
  await page.getByRole("button", { name: "Start" }).click();
  await page.waitForURL(/\/meals\/[^/]+$/);

  await page.getByLabel("Product photo").setInputFiles("../fixtures/photos/olympus-greek-2pct-front.jpg");

  // The real product-name OCR never detects "%" on this photo (main spec
  // §9.1's known, honest M1 finding) - it reads as a bare "2", which won't
  // match any seeded product on a fresh test database, so this always takes
  // the no-match path. That's expected and is what this test exercises.
  await page.getByLabel("Nutrition table photo").setInputFiles("../fixtures/photos/olympus-greek-2pct-nutrition.jpg");
  await expect(page.getByText("Confirm nutrition (per 100g)")).toBeVisible({ timeout: 30_000 });

  await expect(page.getByLabel("Energy (kcal)")).toHaveValue("70");
  await expect(page.getByLabel("Fat (g)")).toHaveValue("2");
  await expect(page.getByLabel("Saturates (g)")).toHaveValue("1.2");
  await expect(page.getByLabel("Carbohydrate (g)")).toHaveValue("4");
  await expect(page.getByLabel("Sugars (g)")).toHaveValue("4");
  await expect(page.getByLabel("Protein (g)")).toHaveValue("9");
  await expect(page.getByLabel("Salt (g)")).toHaveValue("0.18");

  await page.getByRole("button", { name: "Save product" }).click();
  await expect(page.getByText(/^Using /)).toBeVisible();

  await page.getByLabel("Amount (g)").fill("150");
  await page.getByRole("button", { name: "Save ingredient" }).click();
  await expect(page.getByText("Ingredient saved.")).toBeVisible();
  await expect(page.getByText(/105 kcal/)).toBeVisible();
});
