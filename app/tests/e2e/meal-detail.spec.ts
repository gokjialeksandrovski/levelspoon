// app/tests/e2e/meal-detail.spec.ts
import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

import { seedConfidentProduct, signUp, truncateAll } from "./support";

test.beforeEach(async () => {
  await truncateAll();
});

const logAnIngredient = async (page: Page) => {
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
