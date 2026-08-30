// app/tests/e2e/product-correction.spec.ts
import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

import { seedConfidentProduct, signUp, truncateAll } from "./support";

test.beforeEach(async () => {
  await truncateAll();
});

// Mirrors meal-detail.spec.ts's logOneIngredient: the correction screen is now
// reached from a real meal detail page, itself reached through the /capture
// wizard route (the old inline /meals/new -> "Start" -> "Add ingredient" flow
// is gone).
const logOneIngredientThenOpenCorrection = async (page: Page) => {
  await page.getByRole("button", { name: "New meal" }).click();
  // Exact "Product photo" / "Amount (g)" labels, not /.../i: the amount step
  // also carries an "Amount photo (optional)" PhotoInput whose accessible name
  // contains "amount", so a loose regex is a strict-mode-violating ambiguous
  // match (same workaround as capture-flow.spec.ts and meal-detail.spec.ts).
  await page.getByLabel("Product photo").setInputFiles("tests/e2e/fixtures/confident-product.jpg");
  await page.getByLabel("Amount (g)").fill("200");
  await page.getByRole("button", { name: /save/i }).click();
  await page.getByRole("button", { name: /done/i }).click();
  await page.waitForURL(/\/meals\/[^/]+$/);
  const mealUrl = page.url();

  await page.getByRole("link", { name: "Values look wrong?" }).click();
  await expect(page.getByRole("heading", { name: "Correct nutrition (per 100g)" })).toBeVisible();
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
  await expect(page.getByText(/200g · 150 kcal/)).toBeVisible();
  // Task 12's redesigned MealTotal renders "Meal total <n> kcal" (a space, no
  // colon) - the old assertion checked "Meal total:.*150 kcal".
  await expect(page.getByText(/Meal total\s+150 kcal/)).toBeVisible();
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
