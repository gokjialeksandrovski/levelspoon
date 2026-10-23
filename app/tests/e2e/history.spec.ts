import { expect, test } from "@playwright/test";
import { eq } from "drizzle-orm";

import { db } from "../../src/lib/db";
import { mealIngredients, meals, products, users } from "../../src/lib/db/schema";

import { addCalendarDays } from "../../src/lib/date/day-bounds";

import { freshEmail, localToday, truncateAll } from "./support";

test.beforeEach(async () => {
  await truncateAll();
});

test("history lists past days and paginates", async ({ page }) => {
  const email = freshEmail("e2e-history");
  await page.goto("/signup");
  await page.getByLabel("Name").fill("History Tester");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill("correct horse battery staple");
  await page.getByRole("button", { name: "Sign up" }).click();
  await page.waitForURL(/\/day\//);

  const [user] = await db.select().from(users).where(eq(users.email, email));
  const [product] = await db
    .insert(products)
    .values({
      name: "Test Product", nameSearch: "test product", energyKcal: "70", fatG: "2.0", saturatesG: "1.2", carbohydrateG: "4.0",
      sugarsG: "4.0", proteinG: "9.0", saltG: "0.18",
      nutritionPhotoKey: `test/${crypto.randomUUID()}.jpg`, createdByUserId: user.id,
    })
    .returning();

  for (let daysAgo = 0; daysAgo < 21; daysAgo += 1) {
    const [meal] = await db
      .insert(meals)
      .values({ userId: user.id, logDate: addCalendarDays(localToday(), -daysAgo) })
      .returning();
    await db.insert(mealIngredients).values({
      mealId: meal.id,
      productId: product.id,
      quantity: "100",
      quantitySource: "manual",
    });
  }

  await page.goto("/history");
  // The History screen's AppHeader is the "back" variant (Back link + title),
  // not the "day" variant - it has no History icon link or account menu of
  // its own (those live on the day view's header, already covered by
  // day-view.spec.ts). This just confirms the back affordance is present.
  await expect(page.getByRole("heading", { name: "History" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Back" })).toBeVisible();
  await expect(page.getByRole("link", { name: /70 kcal/ })).toHaveCount(20);

  await page.getByRole("button", { name: "Load more" }).click();
  await expect(page.getByRole("link", { name: /70 kcal/ })).toHaveCount(21);
  await expect(page.getByRole("button", { name: "Load more" })).toHaveCount(0);
});

test("a day with nothing logged sits between the days that have food", async ({ page }) => {
  const email = freshEmail("e2e-history-gap");
  await page.goto("/signup");
  await page.getByLabel("Name").fill("History Gap Tester");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill("correct horse battery staple");
  await page.getByRole("button", { name: "Sign up" }).click();
  await page.waitForURL(/\/day\//);

  const [user] = await db.select().from(users).where(eq(users.email, email));
  const [product] = await db
    .insert(products)
    .values({
      name: "Gap Product", nameSearch: "gap product", energyKcal: "70", fatG: "2.0", saturatesG: "1.2", carbohydrateG: "4.0",
      sugarsG: "4.0", proteinG: "9.0", saltG: "0.18",
      nutritionPhotoKey: `test/${crypto.randomUUID()}.jpg`, createdByUserId: user.id,
    })
    .returning();

  const skipped = addCalendarDays(localToday(), -1);
  for (const logDate of [localToday(), addCalendarDays(localToday(), -2)]) {
    const [meal] = await db.insert(meals).values({ userId: user.id, logDate }).returning();
    await db.insert(mealIngredients).values({
      mealId: meal.id, productId: product.id, quantity: "100", quantitySource: "manual",
    });
  }

  await page.goto("/history");
  const skippedRow = page.getByRole("link", { name: /Nothing logged/ });
  await expect(skippedRow).toHaveCount(1);

  // And it is the way to go and fill that day in.
  await skippedRow.click();
  await page.waitForURL(`**/day/${skipped}`);
  await expect(page.getByRole("button", { name: "New meal for yesterday" })).toBeVisible();
});
