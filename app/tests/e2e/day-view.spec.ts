import { expect, test } from "@playwright/test";
import { eq } from "drizzle-orm";

import { db } from "../../src/lib/db";
import { mealIngredients, meals, products, users } from "../../src/lib/db/schema";
import { addCalendarDays, todayLocalDateString } from "../../src/lib/date/day-bounds";

import { freshEmail, signUp, truncateAll } from "./support";

const localToday = () => todayLocalDateString(Intl.DateTimeFormat().resolvedOptions().timeZone);

test.beforeEach(truncateAll);

test("empty today and empty past day show distinct copy", async ({ page }) => {
  await signUp(page);

  await page.goto(`/day/${localToday()}`);
  await expect(page.getByText(/a clean page for today/i)).toBeVisible();

  await page.goto(`/day/${addCalendarDays(localToday(), -1)}`);
  await expect(page.getByText(/nothing was logged/i)).toBeVisible();
});

test("a seeded single-ingredient meal renders as its ingredient's name, with its total", async ({ page }) => {
  // Ruling F10: local inline signup (mirrors history.spec.ts) because this test
  // needs the created user's id afterward - the shared signUp() doesn't return it.
  const email = freshEmail("e2e-day");
  await page.goto("/signup");
  await page.getByLabel("Name").fill("Day Tester");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill("correct horse battery staple");
  await page.getByRole("button", { name: "Sign up" }).click();
  await page.waitForURL(/\/day\//);

  const [user] = await db.select().from(users).where(eq(users.email, email));
  const [product] = await db
    .insert(products)
    .values({
      name: "Seed Yogurt", nameSearch: "seed yogurt", energyKcal: "70", fatG: "2", saturatesG: "1", carbohydrateG: "4",
      sugarsG: "4", proteinG: "9", saltG: "0.1", nutritionPhotoKey: "x", createdByUserId: user.id,
    })
    .returning();
  const [meal] = await db.insert(meals).values({ userId: user.id }).returning();
  await db.insert(mealIngredients).values({
    mealId: meal.id, productId: product.id, quantity: "200", quantitySource: "manual",
  });

  await page.goto(`/day/${localToday()}`);
  // A single-ingredient meal shows the ingredient's own name as the row
  // heading, not an ordinal "Meal 1" (meal-list.tsx's mealHeading).
  // Scoped to the meal row itself, not page-wide: with a single 140kcal meal
  // the day-total Stat also reads "140", so an unscoped getByText(/140/)
  // hits both and trips Playwright's strict-mode ambiguity check.
  const mealLink = page.getByRole("link", { name: /Seed Yogurt/ });
  await expect(mealLink).toBeVisible();
  await expect(mealLink.getByText(/140/)).toBeVisible(); // 200g * 70kcal/100g
});

test("prev/next navigation steps by one calendar day", async ({ page }) => {
  await signUp(page);
  const today = localToday();
  await page.goto(`/day/${today}`);
  await page.getByRole("link", { name: "Previous day" }).click();
  await page.waitForURL(`**/day/${addCalendarDays(today, -1)}`);
  await page.getByRole("link", { name: "Next day" }).click();
  await page.waitForURL(`**/day/${today}`);
  await expect(page.getByRole("link", { name: "Next day" })).toHaveCount(0);
});

test("the date label on a past day returns to today, and a future day redirects there", async ({ page }) => {
  await signUp(page);
  const today = localToday();
  await page.goto(`/day/${addCalendarDays(today, -3)}`);
  await page.getByRole("link", { name: /go to today/ }).click();
  await page.waitForURL(`**/day/${today}`);

  await page.goto(`/day/${addCalendarDays(today, 1)}`);
  await page.waitForURL(`**/day/${today}`);
});

test("the entry point shows today and is absent on a past day", async ({ page }) => {
  await signUp(page);
  await page.goto(`/day/${localToday()}`);
  await expect(page.getByRole("button", { name: "New meal" })).toBeVisible();

  await page.goto(`/day/${addCalendarDays(localToday(), -1)}`);
  await expect(page.getByText(/nothing was logged/i)).toBeVisible();
  await expect(page.getByRole("button", { name: "New meal" })).toHaveCount(0);
  await page.getByRole("link", { name: "Back to today" }).click();
  await page.waitForURL(`**/day/${localToday()}`);
});

test("home redirects to today", async ({ page }) => {
  await signUp(page);
  await page.goto("/");
  await page.waitForURL(`**/day/${localToday()}`);
});
