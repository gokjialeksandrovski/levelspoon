// app/tests/e2e/history.spec.ts
import { expect, test } from "@playwright/test";
import { eq } from "drizzle-orm";

import { db } from "../../src/lib/db";
import { mealIngredients, meals, products, users } from "../../src/lib/db/schema";

import { freshEmail, truncateAll } from "./support";

test.beforeEach(async () => {
  await truncateAll();
});

test("history lists past days and paginates", async ({ page }) => {
  const email = freshEmail("e2e-history");
  await page.goto("/signup");
  await page.getByLabel("Name").fill("History Tester");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("correct horse battery staple");
  await page.getByRole("button", { name: "Sign up" }).click();
  await page.waitForURL(/\/day\//);

  const [user] = await db.select().from(users).where(eq(users.email, email));
  const [product] = await db
    .insert(products)
    .values({
      name: "Test Product", energyKcal: "70", fatG: "2.0", saturatesG: "1.2", carbohydrateG: "4.0",
      sugarsG: "4.0", proteinG: "9.0", saltG: "0.18",
      nutritionPhotoKey: "test/placeholder.jpg", createdByUserId: user.id,
    })
    .returning();

  const ONE_DAY_MS = 24 * 60 * 60 * 1000;
  for (let daysAgo = 0; daysAgo < 21; daysAgo += 1) {
    const [meal] = await db.insert(meals).values({ userId: user.id, name: `Meal ${daysAgo}` }).returning();
    await db.insert(mealIngredients).values({
      mealId: meal.id,
      productId: product.id,
      quantityG: "100",
      quantitySource: "manual",
      createdAt: new Date(Date.now() - daysAgo * ONE_DAY_MS),
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
