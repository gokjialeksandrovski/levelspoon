import { expect, test } from "@playwright/test";
import { eq } from "drizzle-orm";

import { db } from "../../src/lib/db";
import { mealIngredients, meals, users } from "../../src/lib/db/schema";

import { freshEmail, logOneIngredient, seedConfidentProduct, seedProductFor, seedStandardFood, signUp, truncateAll } from "./support";

test.beforeEach(truncateAll);

test("editing an ingredient amount recalculates its contribution", async ({ page }) => {
  await seedConfidentProduct();
  await signUp(page);
  await logOneIngredient(page);

  await page.getByRole("button", { name: "Edit" }).click();
  await page.getByLabel("Amount", { exact: true }).fill("100");
  await page.getByRole("button", { name: "Save" }).click();

  // Matches the ingredient row's own "<qty>g · <kcal> kcal" summary line
  // (QuantitySummary in ingredient-row.tsx). A bare /70 kcal/ would also hit
  // the "Meal total" line, which shows the same figure for this
  // single-ingredient meal - the "100 ?g" half anchors it to the row.
  await expect(page.getByText(/100 ?g.*70 kcal/)).toBeVisible();
});

// Regression: a failed save (amount resolves to 0g, which resolveGrams
// treats as unresolved) used to leave its error message rendered forever,
// even after a subsequent save succeeded - saveIngredientQuantity never
// cleared editing.error on a new attempt (ingredient-row.tsx).
test("a stale error clears once a retried save succeeds", async ({ page }) => {
  await seedConfidentProduct();
  await signUp(page);
  await logOneIngredient(page);

  await page.getByRole("button", { name: "Edit" }).click();
  await page.getByLabel("Amount", { exact: true }).fill("0");
  await page.getByRole("button", { name: "Save" }).click();

  const errorMessage = page.getByText('Couldn\'t work out the amount in "g". Try a different unit.');
  await expect(errorMessage).toBeVisible();
  // A failed resolve doesn't close the editor - the Amount field stays.
  await expect(page.getByLabel("Amount", { exact: true })).toBeVisible();

  await page.getByLabel("Amount", { exact: true }).fill("100");
  await page.getByRole("button", { name: "Save" }).click();

  await expect(errorMessage).toHaveCount(0);
  await expect(page.getByText(/100 ?g.*70 kcal/)).toBeVisible();
});

test("leaving edit mode reverts the draft and saves nothing", async ({ page }) => {
  await seedConfidentProduct();
  await signUp(page);
  await logOneIngredient(page);

  const amountField = page.getByLabel("Amount", { exact: true });
  const correctionLink = page.getByRole("link", { name: /Correct values for/ });
  await expect(correctionLink).toBeVisible();

  await page.getByRole("button", { name: "Edit" }).click();
  await amountField.fill("100");
  // The correction link navigates away mid-edit, so editing owns that slot.
  await expect(correctionLink).toHaveCount(0);

  await page.getByRole("button", { name: /^Cancel editing/ }).click();

  await expect(amountField).toHaveCount(0);
  await expect(correctionLink).toBeVisible();
  await expect(page.getByText(/200 ?g.*140 kcal/)).toBeVisible();

  // Re-opening shows the committed amount, not the abandoned "100".
  await page.getByRole("button", { name: "Edit" }).click();
  await expect(amountField).toHaveValue("200");

  // Escape is the keyboard half of the same exit.
  await amountField.press("Escape");
  await expect(amountField).toHaveCount(0);
  await expect(page.getByText(/200 ?g.*140 kcal/)).toBeVisible();

  // Back is the device half: it leaves the editor, not the meal.
  const mealUrl = page.url();
  await page.getByRole("button", { name: "Edit" }).click();
  await amountField.fill("100");
  await page.goBack();
  await expect(amountField).toHaveCount(0);
  await expect(page).toHaveURL(mealUrl);
  await expect(page.getByText(/200 ?g.*140 kcal/)).toBeVisible();

  // Every other exit spends its own history entry, so Back is never a dead
  // press afterwards - this one leaves the meal.
  await page.goBack();
  await expect(page).not.toHaveURL(mealUrl);
});

test("removing an ingredient leaves Undo in its place, and Undo puts it back", async ({ page }) => {
  await seedConfidentProduct();
  await signUp(page);
  await logOneIngredient(page);

  await page.getByRole("button", { name: "Remove" }).click();
  await expect(page.getByRole("button", { name: /Remove/ })).toHaveCount(0);
  await expect(page.getByText("Meal total")).toHaveCount(0);

  await page.getByRole("button", { name: /Undo removing/ }).click();
  await expect(page.getByRole("button", { name: /Remove/ })).toBeVisible();
  await expect(page.getByText("Meal total")).toBeVisible();
});

test("deleting the meal returns to the day view, which offers Undo", async ({ page }) => {
  await seedConfidentProduct();
  await signUp(page);
  await logOneIngredient(page);

  await page.getByRole("button", { name: "Delete meal" }).click();
  await page.waitForURL(/\/day\/\d{4}-\d{2}-\d{2}$/);
  await expect(page.getByText("Olympus Greek Yogurt 2% Fat")).toHaveCount(0);

  await page.getByRole("button", { name: "Undo deleting the meal" }).click();
  await expect(page.getByText("Olympus Greek Yogurt 2% Fat")).toBeVisible();
});

// Fixed (not Date.now()-relative) so the seeded meal's local day never
// depends on when this suite happens to run.
const PAST_MEAL_DATE = "2020-06-15";

// Seeds a product and a meal logged for PAST_MEAL_DATE against the
// already-signed-up user with this email. Inserted directly rather than
// through the UI only because walking six years of the day bar would be slow.
const seedBackdatedMeal = async (email: string): Promise<string> => {
  const [user] = await db.select().from(users).where(eq(users.email, email));
  const product = await seedProductFor(user.id);

  const [meal] = await db.insert(meals).values({ userId: user.id, logDate: PAST_MEAL_DATE }).returning();
  await db.insert(mealIngredients).values({
    mealId: meal.id, productId: product.id, quantity: "100", quantitySource: "manual",
  });
  return meal.id;
};

// Regression for a meal viewed from a past day (e.g. reached via History):
// Back must return to that meal's own local day, not always today's.
test("back from a meal on a past day returns to that meal's own day", async ({ page }) => {
  const email = await signUp(page, freshEmail("e2e-meal-detail-past"));
  const mealId = await seedBackdatedMeal(email);

  await page.goto(`/meals/${mealId}`);
  // meal-detail.tsx fetches asynchronously on mount and only swaps
  // backHref from today's fallback to the meal's own date once that
  // resolves - wait for the loaded ingredient before clicking Back so this
  // isn't racing the fetch.
  await expect(page.getByText("Test Product")).toBeVisible();
  await page.getByRole("link", { name: "Back" }).click();
  await page.waitForURL(new RegExp(`/day/${PAST_MEAL_DATE}$`));
});

test("the cooking-fat control is optional and adds nothing until used", async ({ page }) => {
  await seedConfidentProduct();
  await signUp(page);
  await logOneIngredient(page);

  await expect(page.getByRole("button", { name: "Add cooking oil or fat" })).toBeVisible();
  await expect(page.getByText(/Meal total.*140 kcal/)).toBeVisible();
});

// Olive oil's real USDA per-100g figures (884 kcal, 0.92 g/mL density) so the
// expected kcal rise matches the spec's own worked example (spec §8 T4):
// 1 tbsp = 15ml * 0.92 = 13.8g; 884 * 13.8/100 = 121.99 -> rounds to 122.
test("adding a cooking fat raises the meal total by its own contribution", async ({ page }) => {
  await seedConfidentProduct();
  await seedStandardFood("Olive oil", {
    category: "fat",
    densityGMl: "0.92",
    nutrition: {
      energyKcal: "884", fatG: "100", saturatesG: "13.81",
      carbohydrateG: "0", sugarsG: "0", proteinG: "0", saltG: "0.01",
    },
  });
  await signUp(page);
  await logOneIngredient(page);

  await page.getByRole("button", { name: "Add cooking oil or fat" }).click();
  await page.getByLabel("Food name").fill("Olive oil");
  await page.getByRole("button", { name: "Search" }).click();
  await page.getByRole("button", { name: "Olive oil" }).click();
  await expect(page.getByLabel("Unit")).toHaveValue("tbsp");
  await page.getByLabel("Amount", { exact: true }).fill("1");
  await page.getByRole("button", { name: "Add to meal" }).click();

  // Row echoes the entry: "1 tbsp", with the resolved weight behind it at the
  // same precision its kcal figure was computed from.
  await expect(page.getByText(/1 tbsp .*13\.8 g.*122 kcal/)).toBeVisible();
  await expect(page.getByText(/Meal total.*262 kcal/)).toBeVisible();
});

test("offers the last cooking-fat amount back as a chip", async ({ page }) => {
  await seedConfidentProduct();
  await seedStandardFood("Olive oil", {
    category: "fat",
    densityGMl: "0.92",
    nutrition: {
      energyKcal: "884", fatG: "100", saturatesG: "13.81",
      carbohydrateG: "0", sugarsG: "0", proteinG: "0", saltG: "0.01",
    },
  });
  await signUp(page);
  await logOneIngredient(page);

  const addOliveOil = async () => {
    await page.getByRole("button", { name: "Add cooking oil or fat" }).click();
    await page.getByLabel("Food name").fill("Olive oil");
    await page.getByRole("button", { name: "Search" }).click();
    // Scoped to the sheet: the meal behind it now has an "Olive oil" row too.
    await page.getByRole("dialog").getByRole("button", { name: "Olive oil" }).click();
  };

  await addOliveOil();
  await expect(page.getByRole("group", { name: "Quick amounts" }).getByRole("button")).toHaveCount(0);
  await page.getByLabel("Amount", { exact: true }).fill("1");
  await page.getByRole("button", { name: "Add to meal" }).click();
  await expect(page.getByText(/1 tbsp .*13\.8 g/)).toBeVisible();

  // Second fat goes in at one tap: the sheet now remembers the tablespoon.
  await addOliveOil();
  await page.getByRole("button", { name: "1 tbsp · 14 g" }).click();
  await page.getByRole("button", { name: "Add to meal" }).click();

  await expect(page.getByText(/Meal total.*384 kcal/)).toBeVisible();
});
