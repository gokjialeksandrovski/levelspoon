import { expect, test, type Page } from "@playwright/test";
import { eq } from "drizzle-orm";

import { db } from "../../src/lib/db";
import { mealIngredients, meals, users, weightEntries } from "../../src/lib/db/schema";
import { addCalendarDays } from "../../src/lib/date/day-bounds";

import { localToday, seedProductFor, signUp, truncateAll } from "./support";

test.beforeEach(truncateAll);

// 2,200 kcal a day against a flat weight is a maintenance of exactly 2,200.
// Mirrors the tier-1 flat-series case, end to end through real rows.
const DAILY_KCAL = 2200;
const FLAT_KG = "80.00";
const SEED_DAYS = 30;

const userIdFor = async (email: string): Promise<string> => {
  const [row] = await db.select({ id: users.id }).from(users).where(eq(users.email, email));
  if (!row) throw new Error(`no user seeded for ${email}`);
  return row.id;
};

// Backdates rows by hand: there is no UI path to a meal logged three weeks ago.
const seedHistory = async (userId: string, days: number): Promise<void> => {
  const today = localToday();
  const product = await seedProductFor(userId, "Measured Burn Staple");
  const quantity = String((DAILY_KCAL / Number(product.energyKcal)) * Number(product.nutritionBasisQuantity));
  for (let back = 0; back < days; back += 1) {
    const date = addCalendarDays(today, -back);
    const loggedAt = new Date(`${date}T12:00:00`);
    const [meal] = await db.insert(meals).values({ userId, createdAt: loggedAt }).returning();
    await db.insert(mealIngredients).values({
      mealId: meal.id,
      productId: product.id,
      quantity,
      quantityUnit: "g",
      quantitySource: "manual",
      createdAt: loggedAt,
    });
    await db.insert(weightEntries).values({ userId, measuredOn: date, weightKg: FLAT_KG });
  }
};

const openEstimate = async (page: Page): Promise<void> => {
  await page.goto(`/day/${localToday()}`);
  await page.getByRole("button", { name: "Set goal" }).click();
  await page.getByRole("link", { name: /Work out the numbers/ }).click();
  await expect(page.getByRole("heading", { name: "Work out your calories" })).toBeVisible();
};

const fillRequired = async (page: Page): Promise<void> => {
  await page.getByRole("radio", { name: "Male", exact: true }).check();
  await page.getByLabel("Birth year").fill(String(new Date().getFullYear() - 30));
  await page.getByLabel("Height").fill("180");
  await page.getByLabel("Current weight").fill("80");
  await page.getByRole("radio", { name: "Active", exact: true }).check();
  await page.getByRole("radio", { name: "Maintain", exact: true }).check();
};

test("a month of flat logs sets maintenance from the logs, not the formula", async ({ page }) => {
  const email = await signUp(page);
  await seedHistory(await userIdFor(email), SEED_DAYS);

  await openEstimate(page);
  await fillRequired(page);

  await page.getByRole("button", { name: "Details" }).click();
  await expect(page.getByText(/from \d+ logged days of the last \d+/)).toBeVisible();
  // BMR 1,780 x 1.55 = 2,759, so the formula would have said 2,760.
  await expect(page.getByText("Formula said 2,760.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Use 2,200" })).toBeVisible();
});

test("a thin history keeps the formula and says what is missing", async ({ page }) => {
  const email = await signUp(page);
  await seedHistory(await userIdFor(email), 9);

  await openEstimate(page);
  await fillRequired(page);

  await page.getByRole("button", { name: "Details" }).click();
  await expect(page.getByText("Measured burn needs a few weeks of logged meals and weigh-ins.")).toBeVisible();
  await expect(page.getByText(/You have 9 logged days and 9 weigh-ins in the last 56\./)).toBeVisible();
  await expect(page.getByRole("button", { name: "Use 2,760" })).toBeVisible();
});
