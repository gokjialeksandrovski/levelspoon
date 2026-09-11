import { expect, test } from "@playwright/test";
import { eq } from "drizzle-orm";

import { db } from "../../src/lib/db";
import { localDateStringOf } from "../../src/lib/date/day-bounds";
import { mealIngredients, meals, users } from "../../src/lib/db/schema";

import { freshEmail, logOneIngredient, seedConfidentProduct, seedProductFor, signUp, truncateAll } from "./support";

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

// Fixed (not Date.now()-relative) so the seeded meal's local day never
// depends on when this suite happens to run.
const PAST_MEAL_CREATED_AT = "2020-06-15T12:00:00.000Z";

// Seeds a product and a meal backdated to PAST_MEAL_CREATED_AT for the
// already-signed-up user with this email, mirroring history.spec.ts's
// direct-insert pattern (there is no UI path to a backdated meal).
const seedBackdatedMeal = async (email: string): Promise<string> => {
  const [user] = await db.select().from(users).where(eq(users.email, email));
  const product = await seedProductFor(user.id);

  const createdAt = new Date(PAST_MEAL_CREATED_AT);
  const [meal] = await db.insert(meals).values({ userId: user.id, createdAt }).returning();
  await db.insert(mealIngredients).values({
    mealId: meal.id, productId: product.id, quantityG: "100", quantitySource: "manual", createdAt,
  });
  return meal.id;
};

// Regression for a meal viewed from a past day (e.g. reached via History):
// Back must return to that meal's own local day, not always today's.
test("back from a meal on a past day returns to that meal's own day", async ({ page }) => {
  const email = await signUp(page, freshEmail("e2e-meal-detail-past"));
  const mealId = await seedBackdatedMeal(email);
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const expectedDate = localDateStringOf(new Date(PAST_MEAL_CREATED_AT), timezone);

  await page.goto(`/meals/${mealId}`);
  // meal-detail.tsx fetches asynchronously on mount and only swaps
  // backHref from today's fallback to the meal's own date once that
  // resolves - wait for the loaded ingredient before clicking Back so this
  // isn't racing the fetch.
  await expect(page.getByText("Test Product")).toBeVisible();
  await page.getByRole("link", { name: "Back" }).click();
  await page.waitForURL(new RegExp(`/day/${expectedDate}$`));
});
