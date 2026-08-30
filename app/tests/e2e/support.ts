import type { Page } from "@playwright/test";
import { sql } from "drizzle-orm";

import { db } from "../../src/lib/db";
import { products, users } from "../../src/lib/db/schema";

export const freshEmail = (prefix = "e2e") => `${prefix}-${crypto.randomUUID()}@example.com`;

export const truncateAll = () =>
  db.execute(sql`TRUNCATE TABLE products, meal_ingredients, meals, "user" CASCADE`);

const BASE_NUTRITION = {
  energyKcal: "70", fatG: "2.0", saturatesG: "1.2", carbohydrateG: "4.0",
  sugarsG: "4.0", proteinG: "9.0", saltG: "0.18", nutritionPhotoKey: "test/placeholder.jpg",
};

export const seedConfidentProduct = async (name = "Olympus Greek Yogurt 2% Fat") => {
  const [user] = await db.insert(users).values({ email: freshEmail("seed") }).returning();
  await db.insert(products).values({ ...BASE_NUTRITION, name, createdByUserId: user.id });
};

export const seedAmbiguousVariants = async () => {
  const [user] = await db.insert(users).values({ email: freshEmail("seed") }).returning();
  await db.insert(products).values([
    { ...BASE_NUTRITION, name: "Olympus Greek Yogurt 2% Fat", createdByUserId: user.id },
    { ...BASE_NUTRITION, name: "Olympus Greek Yogurt 10% Fat", createdByUserId: user.id },
  ]);
};

// Signing up lands on "/", which redirects to the local day view - so the
// wait targets /day/ rather than any one date string.
export const signUp = async (page: Page) => {
  await page.goto("/signup");
  await page.getByLabel("Name").fill("E2E Tester");
  await page.getByLabel("Email").fill(freshEmail());
  await page.getByLabel("Password").fill("correct horse battery staple");
  await page.getByRole("button", { name: "Sign up" }).click();
  await page.waitForURL(/\/day\//);
};
