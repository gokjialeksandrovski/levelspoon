import { expect, test } from "@playwright/test";

import { signUp, truncateAll } from "./support";

// This local dev Postgres persists across runs (it's not re-created per
// suite), so without this the products table accumulates rows across
// sessions and pollutes matchProduct's global similarity search - the exact
// failure mode that already bit the tier-3 suite (capture-flow.spec.ts's
// beforeEach) before this same fix was applied there.
test.beforeEach(async () => {
  await truncateAll();
});

test("real stack: real photos through real OCR produce the golden nutrition values", async ({ page }) => {
  await signUp(page);

  await page.getByRole("button", { name: "New meal" }).click();
  await page.waitForURL(/\/meals\/[^/]+\/capture$/);

  await page.getByLabel(/product photo/i).setInputFiles("../fixtures/photos/olympus-greek-2pct-front.jpg");

  // The real product-name OCR never detects "%" on this photo (main spec's
  // known, honest M1 finding) - it reads as a bare "2", which won't match any
  // seeded product on a fresh test database, so this always takes the
  // no-match path. That's expected and is what this test exercises.
  await page.getByLabel(/nutrition table photo/i).setInputFiles("../fixtures/photos/olympus-greek-2pct-nutrition.jpg");
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

  // Not /amount/i: the amount step also has an "Amount photo (optional)"
  // PhotoInput, whose accessible name also contains "amount" and would make
  // that a strict-mode-violating ambiguous match - matches meal-detail.spec.ts's
  // precedent for the same step.
  await page.getByLabel("Amount (g)").fill("150");
  await page.getByRole("button", { name: "Save ingredient" }).click();
  await expect(page.getByText("Ingredient saved.")).toBeVisible();
  await page.getByRole("button", { name: "Done" }).click();

  await page.waitForURL(/\/meals\/[^/]+$/);
  // 150g at 70kcal/100g = 105 kcal - read this off the ingredient row
  // (IngredientRow's "<qty>g · <kcal> kcal" summary line) and the meal total
  // (MealTotal's "Meal total <kcal> kcal" line), matching the current
  // meal-detail markup (Task 12/meal-detail.spec.ts's precedent).
  await expect(page.getByText(/150 ?g.*105 kcal/)).toBeVisible();
  await expect(page.getByText(/Meal total\s+105 kcal/)).toBeVisible();
});
