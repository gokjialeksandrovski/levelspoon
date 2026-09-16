import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

import { logOneIngredient, seedConfidentProduct, signUp, truncateAll } from "./support";

test.beforeEach(truncateAll);

// The correction screen is reached from a real meal detail page (itself
// reached through the /capture wizard) via its "Values look wrong?" link,
// whose accessible name is "Correct values for <product name>" (accessibility
// pass, commit b4391ed) rather than its visible text.
const logOneIngredientThenOpenCorrection = async (page: Page) => {
  const mealUrl = await logOneIngredient(page);
  await page.getByRole("link", { name: /Correct values for/ }).click();
  await expect(page.getByRole("heading", { name: "Correct nutrition (per 100 g)" })).toBeVisible();
  return mealUrl;
};

test("correcting a product from the meal detail page: an invalid value blocks save until fixed", async ({ page }) => {
  await seedConfidentProduct();
  await signUp(page);

  const mealUrl = await logOneIngredientThenOpenCorrection(page);

  await page.getByLabel("Saturates (g)").fill("5");
  await page.getByLabel("Saturates (g)").blur();
  await expect(page.getByRole("button", { name: "Save correction" })).toBeDisabled();

  await page.getByLabel("Saturates (g)").fill("1.2");
  await page.getByLabel("Saturates (g)").blur();
  await expect(page.getByRole("button", { name: "Save correction" })).toBeEnabled();

  // Also correct Energy (kcal) so the save actually changes a value that
  // affects displayed kcal - fixing Saturates back to its original number
  // alone wouldn't change the meal/ingredient total.
  await page.getByLabel("Energy (kcal)").fill("75");
  await page.getByLabel("Energy (kcal)").blur();
  await expect(page.getByRole("button", { name: "Save correction" })).toBeEnabled();

  await page.getByRole("button", { name: "Save correction" }).click();
  await page.waitForURL(mealUrl);

  // 200g at the corrected 75 kcal/100g = 150 kcal, up from the original 140 -
  // and the page must show it fresh, not the pre-correction value from the
  // client Router Cache.
  await expect(page.getByText(/200 g · 150 kcal/)).toBeVisible();
  // \s* not \s+: MealTotal's label and figure are adjacent spans, so the
  // paragraph's text content has no separator between them.
  await expect(page.getByText(/Meal total\s*150 kcal/)).toBeVisible();
});

test("clicking Save right after typing an invalid value (before blur) still blocks the save", async ({ page }) => {
  await seedConfidentProduct();
  await signUp(page);

  await logOneIngredientThenOpenCorrection(page);

  // Deliberately no blur here: `flags` is still the initial (empty) state from
  // the mount-time validate call, so the Save button reads as enabled even
  // though this value is invalid (saturates > fat) - the exact race handleSave
  // must close by re-validating fresh right before it saves anything.
  await page.getByLabel("Saturates (g)").fill("5");
  await expect(page.getByRole("button", { name: "Save correction" })).toBeEnabled();

  await page.getByRole("button", { name: "Save correction" }).click();

  await expect(page.getByText("Please fix the flagged values before saving.")).toBeVisible();
  // Still on the correction page - the invalid value was never saved.
  await expect(page).toHaveURL(/\/products\/.+\/correct$/);
});

test("correcting a per-unit product shows its own basis heading and saves in that same unit", async ({ page }) => {
  await signUp(page);

  await page.getByRole("button", { name: "New meal" }).click();
  await page.waitForURL(/\/meals\/[^/]+\/capture$/);
  await page.getByLabel(/product photo/i).setInputFiles("tests/e2e/fixtures/no-match-product.jpg");
  await page.getByLabel(/nutrition table photo/i).setInputFiles("tests/e2e/fixtures/nutrition-per-unit.jpg");
  await expect(page.getByText("Confirm nutrition (per 1 tbsp)")).toBeVisible();
  await page.getByRole("button", { name: /save product/i }).click();
  await page.getByLabel("Amount", { exact: true }).fill("2");
  await page.getByRole("button", { name: "Save ingredient" }).click();
  await expect(page.getByText("Ingredient saved.")).toBeVisible();
  await page.getByRole("button", { name: /done/i }).click();
  await page.waitForURL(/\/meals\/[^/]+$/);
  const mealUrl = page.url();

  await page.getByRole("link", { name: /Correct values for/ }).click();
  // The correction screen's heading is basis-aware, not a hardcoded
  // "per 100g" (spec §6, T3's correction-form.tsx change).
  await expect(page.getByRole("heading", { name: "Correct nutrition (per 1 tbsp)" })).toBeVisible();

  await page.getByLabel("Energy (kcal)").fill("100");
  await page.getByLabel("Energy (kcal)").blur();
  await page.getByRole("button", { name: "Save correction" }).click();
  await page.waitForURL(mealUrl);

  // 2 tbsp at the corrected 100 kcal/tbsp = 200 kcal - the edited number
  // stays in the row's existing basis, never converted to grams (spec §6).
  await expect(page.getByText("2 tbsp · 200 kcal")).toBeVisible();
});
