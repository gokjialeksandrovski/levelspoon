import { expect, test } from "@playwright/test";

import { seedAmbiguousVariants, seedConfidentProduct, signUp, truncateAll } from "./support";

test.beforeEach(async () => {
  await truncateAll();
});

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
