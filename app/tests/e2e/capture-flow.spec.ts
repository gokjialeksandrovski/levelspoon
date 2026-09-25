import { expect, test } from "@playwright/test";

import { localToday, seedAmbiguousVariants, seedConfidentProduct, seedStandardFood, signUp, truncateAll } from "./support";

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
  await page.getByRole("button", { name: "Close" }).click();
  await page.waitForURL(`**/day/${localToday()}`);
  await expect(page.getByRole("link", { name: /Meal 1/ })).toHaveCount(0);
});

test("whole food: search and pick a standard food, reach the amount step and save", async ({ page }) => {
  await seedStandardFood("Banana");
  await signUp(page);

  await page.getByRole("button", { name: "New meal" }).click();
  await page.waitForURL(/\/meals\/[^/]+\/capture$/);
  await page.getByRole("button", { name: "Whole food, no packaging" }).click();
  await page.getByLabel("Food name").fill("Banana");
  await page.getByRole("button", { name: "Search" }).click();
  await page.getByRole("button", { name: "Banana" }).click();
  await expect(page.getByLabel("Amount", { exact: true })).toBeVisible();
  await page.getByLabel("Amount", { exact: true }).fill("120");
  await page.getByRole("button", { name: "Save ingredient" }).click();
  await expect(page.getByText("Ingredient saved.")).toBeVisible();
});

test("whole food: empty search shows the no-match copy and returns to product photo", async ({ page }) => {
  await signUp(page);
  await page.getByRole("button", { name: "New meal" }).click();
  await page.waitForURL(/\/meals\/[^/]+\/capture$/);
  await page.getByRole("button", { name: "Whole food, no packaging" }).click();
  await page.getByLabel("Food name").fill("zzznotarealfood");
  await page.getByRole("button", { name: "Search" }).click();
  await expect(page.getByText(/No match/)).toBeVisible();
  await page.getByRole("button", { name: "Choose a different way" }).click();
  await expect(page.getByLabel(/product photo/i)).toBeVisible();
});

// Back on a single-step path discards the capture, so manual entry has to be
// a step of its own.
test("manual name entry: the header's Back returns to the entry options, not out of the wizard", async ({ page }) => {
  await signUp(page);
  await page.getByRole("button", { name: "New meal" }).click();
  await page.waitForURL(/\/meals\/[^/]+\/capture$/);

  await page.getByRole("button", { name: "Type a packaged product's name" }).click();
  await expect(page.getByRole("heading", { name: "Type the product name" })).toBeVisible();

  await page.getByRole("button", { name: "Back", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Add a product" })).toBeVisible();
  await expect(page).toHaveURL(/\/meals\/[^/]+\/capture$/);
});

test("per-unit product (household measure, no printed grams): capture, log, and see it in the day total", async ({ page }) => {
  await signUp(page);

  await page.getByRole("button", { name: "New meal" }).click();
  await page.waitForURL(/\/meals\/[^/]+\/capture$/);
  await page.getByLabel(/product photo/i).setInputFiles("tests/e2e/fixtures/no-match-product.jpg");
  await page.getByLabel(/nutrition table photo/i).setInputFiles("tests/e2e/fixtures/nutrition-per-unit.jpg");

  // No printed grams and no known density for this name - the label's own
  // "2 Tablespoon" serving becomes the product's basis instead of asking a
  // question with no answer ("how many grams is 2 tbsp?"). This is the
  // reported bug's fix (spec §1/§5).
  await expect(page.getByRole("heading", { name: "Nutrition per 1 tbsp" })).toBeVisible();
  await expect(page.getByLabel("Energy (kcal)")).toHaveValue("95");
  await page.getByRole("button", { name: /save product/i }).click();

  // The amount step offers only the product's own basis unit - no grams
  // fallback exists to convert an unknown density to (spec §6).
  // A single unit is printed, not offered as a one-option dropdown.
  await expect(page.getByLabel("Unit")).toHaveCount(0);
  const amountInput = page.getByLabel("Amount", { exact: true });
  await expect(amountInput).toHaveAccessibleDescription("in tbsp");

  await amountInput.fill("2");
  await page.getByRole("button", { name: "Save ingredient" }).click();
  await expect(page.getByText("Ingredient saved.")).toBeVisible();
  await page.getByRole("button", { name: /done/i }).click();
  await page.waitForURL(/\/meals\/[^/]+$/);

  // 2 tbsp at 95 kcal/tbsp = 190 kcal.
  await expect(page.getByText("2 tbsp · 190 kcal")).toBeVisible();

  await page.goto(`/day/${localToday()}`);
  const mealLink = page.getByRole("link", { name: /Completely Unrelated Product Name Zzz/ });
  await expect(mealLink).toBeVisible();
  await expect(mealLink.getByText(/190/)).toBeVisible();
});
