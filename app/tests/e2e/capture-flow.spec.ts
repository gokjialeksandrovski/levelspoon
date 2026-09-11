import { expect, test } from "@playwright/test";

import { localToday, seedAmbiguousVariants, seedConfidentProduct, signUp, truncateAll } from "./support";

test.beforeEach(truncateAll);

test("one ingredient: Done lands on the meal detail, and the day view total updates", async ({ page }) => {
  await seedConfidentProduct();
  await signUp(page);

  await page.getByRole("button", { name: "New meal" }).click();
  await page.waitForURL(/\/meals\/[^/]+\/capture$/);
  await page.getByLabel(/product photo/i).setInputFiles("tests/e2e/fixtures/confident-product.jpg");
  await expect(page.getByText("Olympus Greek Yogurt 2% Fat")).toBeVisible();
  // "Amount" with { exact: true } not substring: the same step also carries an "Amount photo
  // (optional)" file input, which a substring match would catch as well.
  await page.getByLabel("Amount", { exact: true }).fill("200");
  await page.getByRole("button", { name: "Save ingredient" }).click();
  await expect(page.getByText("Ingredient saved.")).toBeVisible();
  await page.getByRole("button", { name: /done/i }).click();
  await page.waitForURL(/\/meals\/[^/]+$/);

  await page.goto(`/day/${localToday()}`);
  // A single-ingredient meal shows the ingredient's own name as the row
  // heading, not an ordinal "Meal 1" (meal-list.tsx's mealHeading).
  // Scoped to the meal row: with a single 140kcal meal the day-total Stat
  // reads "140" too, so a page-wide getByText(/140/) matches both and trips
  // Playwright's strict-mode check (same reason as in day-view.spec.ts).
  const mealLink = page.getByRole("link", { name: /Olympus Greek Yogurt/ });
  await expect(mealLink).toBeVisible();
  await expect(mealLink.getByText(/140/)).toBeVisible(); // 200g * 70kcal/100g
});

test("new meal: add two ingredients then finish on the meal detail", async ({ page }) => {
  await seedConfidentProduct();
  await signUp(page);

  await page.getByRole("button", { name: "New meal" }).click();
  await page.waitForURL(/\/meals\/[^/]+\/capture$/);

  for (const grams of ["100", "150"]) {
    await page.getByLabel(/product photo/i).setInputFiles("tests/e2e/fixtures/confident-product.jpg");
    await page.getByLabel("Amount", { exact: true }).fill(grams);
    await page.getByRole("button", { name: "Save ingredient" }).click();
    await expect(page.getByText("Ingredient saved.")).toBeVisible();
    if (grams === "100") {
      await page.getByRole("button", { name: /add another/i }).click();
    }
  }
  await page.getByRole("button", { name: /done/i }).click();

  await page.waitForURL(/\/meals\/[^/]+$/);
  await expect(page.getByRole("heading", { name: "Meal 1" })).toBeVisible();
  await expect(page.getByText("Olympus Greek Yogurt 2% Fat")).toHaveCount(2);
});

test("ambiguous match: pick a candidate, reach the amount step", async ({ page }) => {
  await seedAmbiguousVariants();
  await signUp(page);
  await page.getByRole("button", { name: "New meal" }).click();
  await page.getByLabel(/product photo/i).setInputFiles("tests/e2e/fixtures/ambiguous-product.jpg");
  // The step's own <h2>, not a looser /which product/i: the wizard header
  // now titles the screen with an <h1> ("Which product?") too, and a
  // substring match would hit both (found via /accessibility, 2026-09-10).
  await expect(page.getByRole("heading", { name: "Which product is this?" })).toBeVisible();
  await page.getByRole("button", { name: "Olympus Greek Yogurt 2% Fat" }).click();
  await expect(page.getByLabel("Amount", { exact: true })).toBeVisible();
});

test("no match: create a product, reach the amount step", async ({ page }) => {
  await signUp(page);
  await page.getByRole("button", { name: "New meal" }).click();
  await page.getByLabel(/product photo/i).setInputFiles("tests/e2e/fixtures/no-match-product.jpg");
  await page.getByLabel(/nutrition table photo/i).setInputFiles("tests/e2e/fixtures/nutrition-valid.jpg");
  await expect(page.getByText(/confirm nutrition/i)).toBeVisible();
  await page.getByRole("button", { name: /save product/i }).click();
  await expect(page.getByLabel("Amount", { exact: true })).toBeVisible();
});

test("abandoning a new meal on step 1 leaves no stray meal", async ({ page }) => {
  await signUp(page);
  await page.getByRole("button", { name: "New meal" }).click();
  await page.waitForURL(/\/capture$/);
  await page.getByRole("button", { name: "Back" }).click();
  await page.waitForURL(`**/day/${localToday()}`);
  await expect(page.getByRole("link", { name: /Meal 1/ })).toHaveCount(0);
});
