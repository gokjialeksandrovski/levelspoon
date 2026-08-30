// app/tests/e2e/meal-detail.spec.ts
import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

import { seedConfidentProduct, signUp, truncateAll } from "./support";

test.beforeEach(async () => {
  await truncateAll();
});

const logOneIngredient = async (page: Page) => {
  await page.getByRole("button", { name: "New meal" }).click();
  await page.getByLabel(/product photo/i).setInputFiles("tests/e2e/fixtures/confident-product.jpg");
  // Not /amount/i: the amount step also has an "Amount photo (optional)"
  // PhotoInput, whose accessible name also contains "amount" and would make
  // that a strict-mode-violating ambiguous match. "Amount (g)" is the exact
  // label of the numeric Field, so it doesn't collide with it.
  await page.getByLabel("Amount (g)").fill("200");
  await page.getByRole("button", { name: /save/i }).click();
  await page.getByRole("button", { name: /done/i }).click();
  await page.waitForURL(/\/meals\/[^/]+$/);
};

test("editing an ingredient amount recalculates its contribution", async ({ page }) => {
  await seedConfidentProduct();
  await signUp(page);
  await logOneIngredient(page);

  await page.getByRole("button", { name: "Edit" }).click();
  await page.getByLabel("Amount (g)").fill("100");
  await page.getByRole("button", { name: "Save" }).click();

  // Matches the ingredient row's own "<qty>g · <kcal> kcal" summary line
  // (QuantitySummary in ingredient-row.tsx). A bare /70 kcal/ would also hit
  // the "Meal total" line, which shows the same figure for this
  // single-ingredient meal - the "100 ?g" half anchors it to the row.
  await expect(page.getByText(/100 ?g.*70 kcal/)).toBeVisible();
});

test("removing an ingredient via the confirm sheet takes it off the meal", async ({ page }) => {
  await seedConfidentProduct();
  await signUp(page);
  await logOneIngredient(page);

  await page.getByRole("button", { name: "Remove" }).click();
  await page.getByRole("button", { name: /remove/i }).nth(1).click(); // sheet confirm
  await expect(page.getByText("Olympus Greek Yogurt 2% Fat")).toHaveCount(0);
});

test("deleting the meal returns to the day view", async ({ page }) => {
  await seedConfidentProduct();
  await signUp(page);
  await logOneIngredient(page);

  await page.getByRole("button", { name: "Delete meal" }).click();
  await page.getByRole("button", { name: /delete/i }).nth(1).click(); // sheet confirm
  await page.waitForURL(/\/day\//);
  await expect(page.getByRole("link", { name: /Meal 1/ })).toHaveCount(0);
});
