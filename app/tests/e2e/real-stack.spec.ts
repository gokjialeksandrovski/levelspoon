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
  // The label prints 0.18, and nutrition-fields.ts's toDisplayValue now
  // rounds to two decimals precisely so a real label figure like this one
  // reproduces exactly, rather than collapsing to 0.2.
  await expect(page.getByLabel("Salt (g)")).toHaveValue("0.18");

  await page.getByRole("button", { name: "Save product" }).click();
  await expect(page.getByText(/^Using /)).toBeVisible();

  // "Amount" with { exact: true } not substring: the amount step also has an "Amount photo (optional)"
  // PhotoInput, whose accessible name also contains "amount" and would match as a substring.
  // See support.ts's logOneIngredient for the same disambiguation.
  await page.getByLabel("Amount", { exact: true }).fill("150");
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

test("real stack: correcting one flagged value also clears another flagged only by relation to it", async ({ page }) => {
  await signUp(page);

  await page.getByRole("button", { name: "New meal" }).click();
  await page.waitForURL(/\/meals\/[^/]+\/capture$/);

  await page.getByLabel(/product photo/i).setInputFiles("../fixtures/photos/bella_farm_yoghurt.jpg");
  await page
    .getByLabel(/nutrition table photo/i)
    .setInputFiles("../fixtures/photos/bella_farm_yoghurt_nutrition.jpg");
  await expect(page.getByText("Confirm nutrition (per 100g)")).toBeVisible({ timeout: 30_000 });

  // Reported defect: the label's header phrase prints aligned with the row
  // descriptions rather than the numeric column, and its low-confidence
  // saturates figure OCRs badly enough to read as 8 instead of 1.8 -
  // implausibly more than the label's own fat figure, so both get flagged.
  // Both fields already have a reading (neither is blank), so both show the
  // "looks off" wording, not "could not read" - that message is reserved
  // for a field with no reading at all, which neither of these is.
  await expect(page.getByLabel("Fat (g)")).toHaveValue("2.8");
  await expect(page.getByLabel("Saturates (g)")).toHaveValue("8");
  await expect(page.getByText("This value looks off - please double-check it")).toHaveCount(2);

  // Correcting saturates alone must also clear fat's warning: fat was only
  // flagged because of the RELATIONSHIP between the two (saturates can't
  // exceed fat), never because fat's own reading was wrong.
  await page.getByLabel("Saturates (g)").fill("1.8");
  await page.getByLabel("Saturates (g)").blur();
  await expect(page.getByText("This value looks off - please double-check it")).toHaveCount(0);

  await page.getByRole("button", { name: "Save product" }).click();
  await expect(page.getByText(/^Using /)).toBeVisible();
});

test("real stack: a linear US label with no printed gram weight asks once, then scales", async ({ page }) => {
  await signUp(page);

  await page.getByRole("button", { name: "New meal" }).click();
  await page.waitForURL(/\/meals\/[^/]+\/capture$/);

  await page.getByLabel(/product photo/i).setInputFiles("../fixtures/photos/snickers-linear-nutrition.jpg");
  await page.getByLabel(/nutrition table photo/i).setInputFiles("../fixtures/photos/snickers-linear-nutrition.jpg");

  // "1 bar" carries no gram weight and is neither a mass nor a volume, so the
  // pipeline asks rather than guessing - the one question the whole design
  // exists to make precise.
  await expect(page.getByText(/Serving size reads/)).toBeVisible({ timeout: 30_000 });
  await page.getByLabel("Serving measurement").fill("52g");
  await page.getByRole("button", { name: "Continue" }).click();

  await expect(page.getByText("Confirm nutrition (per 100g)")).toBeVisible();
  // 250 kcal on a 52 g bar -> 480.8 per 100 g; 12 g fat -> 23.1.
  await expect(page.getByLabel("Energy (kcal)")).toHaveValue("480.8");
  await expect(page.getByLabel("Fat (g)")).toHaveValue("23.1");

  await page.getByRole("button", { name: "Save product" }).click();
  await expect(page.getByText(/^Using /)).toBeVisible();
});
