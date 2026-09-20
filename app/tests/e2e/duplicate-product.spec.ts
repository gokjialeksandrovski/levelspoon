import { expect, test } from "@playwright/test";

import { enterNutritionManually, signUp, startCapture, truncateAll } from "./support";

// similarity('Snickers Bar', 'Snickers') = 0.6923 (well above the 0.35 floor)
// and similarity('Bella Farm Yoghurt', 'Candy Bar') = 0.0357 - the two tiers
// this spec exercises need opposite name-similarity outcomes, so the pairs are
// not interchangeable (per task-6-brief.md's fixture note).
const FIGURES = {
  energyKcal: "484", fatG: "24.1", saturatesG: "9", carbohydrateG: "59.8",
  sugarsG: "48.6", proteinG: "7.9", saltG: "0.6",
};

test.beforeEach(truncateAll);

test("offers the product that already has these figures", async ({ page }) => {
  await signUp(page);
  await startCapture(page, "Snickers Bar");
  await enterNutritionManually(page, FIGURES);
  await page.getByRole("button", { name: "Save product" }).click();
  await expect(page.getByLabel("Amount", { exact: true })).toBeVisible();

  // "Snickers" scores 0.6923 against the row just created, so the typed-name
  // search (searchUserProducts) offers it as a candidate before nutrition-photo -
  // "None of these" is the same dismissal a real user takes to file a second one.
  await startCapture(page, "Snickers");
  await page.getByRole("button", { name: "None of these" }).click();
  await enterNutritionManually(page, FIGURES);
  await page.getByRole("button", { name: "Save product" }).click();

  await expect(page.getByText(/Snickers Bar already has these figures/)).toBeVisible();
  await page.getByRole("button", { name: "Use Snickers Bar instead" }).click();
  await expect(page.getByLabel("Amount", { exact: true })).toBeVisible();
});

test("files an unrelated product once the identical figures are acknowledged", async ({ page }) => {
  await signUp(page);
  await startCapture(page, "Bella Farm Yoghurt");
  await enterNutritionManually(page, FIGURES);
  await page.getByRole("button", { name: "Save product" }).click();
  await expect(page.getByLabel("Amount", { exact: true })).toBeVisible();

  await startCapture(page, "Candy Bar");
  await enterNutritionManually(page, FIGURES);
  await page.getByRole("button", { name: "Save product" }).click();

  await expect(page.getByText(/already has these exact figures/)).toBeVisible();
  await page.getByLabel(/different product/i).check();
  await page.getByRole("button", { name: "Save product" }).click();
  await expect(page.getByLabel("Amount", { exact: true })).toBeVisible();
});
