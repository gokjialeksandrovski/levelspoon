// app/tests/e2e/day-view.spec.ts
import { expect, test } from "@playwright/test";
import { sql } from "drizzle-orm";

import { db } from "../../src/lib/db";
import { products, users } from "../../src/lib/db/schema";
import { addCalendarDays, todayLocalDateString } from "../../src/lib/date/day-bounds";

const freshEmail = () => `e2e-day-${crypto.randomUUID()}@example.com`;

test.beforeEach(async () => {
  await db.execute(sql`TRUNCATE TABLE products, meal_ingredients, meals, "user" CASCADE`);
});

const seedConfidentProduct = async () => {
  const [user] = await db.insert(users).values({ email: freshEmail() }).returning();
  await db.insert(products).values({
    name: "Olympus Greek Yogurt 2% Fat",
    energyKcal: "70", fatG: "2.0", saturatesG: "1.2", carbohydrateG: "4.0",
    sugarsG: "4.0", proteinG: "9.0", saltG: "0.18",
    nutritionPhotoKey: "test/placeholder.jpg", createdByUserId: user.id,
  });
};

const signUp = async (page: import("@playwright/test").Page) => {
  await page.goto("/signup");
  await page.getByLabel("Name").fill("E2E Tester");
  await page.getByLabel("Email").fill(freshEmail());
  await page.getByLabel("Password").fill("correct horse battery staple");
  await page.getByRole("button", { name: "Sign up" }).click();
  await page.waitForURL("**/meals/new");
};

const localToday = () => todayLocalDateString(Intl.DateTimeFormat().resolvedOptions().timeZone);

test("empty day shows a start-meal CTA", async ({ page }) => {
  await signUp(page);

  await page.goto(`/day/${localToday()}`);

  await expect(page.getByText("No meals logged")).toBeVisible();
  await expect(page.getByRole("link", { name: "Start a meal" })).toBeVisible();
  await expect(page.getByRole("link", { name: "History" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Sign out" })).toBeVisible();
});

test("a logged meal appears on the day view with the day total", async ({ page }) => {
  await seedConfidentProduct();
  await signUp(page);

  await page.getByRole("button", { name: "Start" }).click();
  await page.waitForURL(/\/meals\/[^/]+$/);
  await page.getByRole("button", { name: "Add ingredient" }).click();
  await page.getByLabel("Product photo").setInputFiles("tests/e2e/fixtures/confident-product.jpg");
  await page.getByLabel("Amount (g)").fill("200");
  await page.getByRole("button", { name: "Save ingredient" }).click();
  await expect(page.getByText("Ingredient saved.")).toBeVisible();

  await page.goto(`/day/${localToday()}`);

  await expect(page.getByRole("link", { name: /Meal 1/ })).toBeVisible();
  // Anchored to the "Day total:" prefix, not a bare /140 kcal/, because the
  // day has exactly one meal here: its list-item link also renders "140
  // kcal", so an unanchored match resolves to two elements (strict-mode
  // violation) - the totals bar and the meal link.
  await expect(page.getByText(/Day total:.*140 kcal/)).toBeVisible();
});

test("previous/next navigation steps by one calendar day", async ({ page }) => {
  await signUp(page);
  const today = localToday();

  await page.goto(`/day/${today}`);
  await page.getByRole("link", { name: "← Previous day" }).click();
  await page.waitForURL(`**/day/${addCalendarDays(today, -1)}`);

  await page.getByRole("link", { name: "Next day →" }).click();
  await page.waitForURL(`**/day/${today}`);
});

test("home redirects to today's day view", async ({ page }) => {
  await signUp(page);

  await page.goto("/");

  await page.waitForURL(`**/day/${localToday()}`);
});
