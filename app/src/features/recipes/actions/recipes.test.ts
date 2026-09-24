import { sql } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";

import { db } from "@/lib/db";
import { mealIngredients, meals, products, recipeItems, recipes, users } from "@/lib/db/schema";
import { todayLocalDateString } from "@/lib/date/day-bounds";

const TODAY = todayLocalDateString("UTC");

const seedUser = async (): Promise<string> => {
  const [user] = await db.insert(users).values({ email: `r-${crypto.randomUUID()}@example.com` }).returning();
  return user.id;
};

const seedProduct = async (userId: string, name = "Test Product"): Promise<string> => {
  const [product] = await db
    .insert(products)
    .values({
      name,
      nameSearch: name.toLowerCase(),
      energyKcal: "70",
      fatG: "2.0",
      saturatesG: "1.2",
      carbohydrateG: "4.0",
      sugarsG: "4.0",
      proteinG: "9.0",
      saltG: "0.18",
      nutritionPhotoKey: `test/${crypto.randomUUID()}.jpg`,
      createdByUserId: userId,
    })
    .returning();
  return product.id;
};

beforeEach(async () => {
  await db.execute(
    sql`TRUNCATE TABLE recipe_items, recipes, products, product_overrides, meal_ingredients, meals, "user" CASCADE`,
  );
});

describe("recipes schema", () => {
  it("stores a recipe with items and links a meal to it", async () => {
    const userId = await seedUser();
    const productId = await seedProduct(userId);
    const [recipe] = await db
      .insert(recipes)
      .values({ userId, name: "Chicken rice bowl", nameSearch: "chicken rice bowl" })
      .returning();
    await db.insert(recipeItems).values({
      recipeId: recipe.id,
      productId,
      quantity: "180.00",
      quantityUnit: "g",
      entryCount: "180.00",
      entryUnit: "g",
      position: 0,
    });
    const [meal] = await db
      .insert(meals)
      .values({ userId, logDate: TODAY, recipeId: recipe.id })
      .returning();

    const items = await db.select().from(recipeItems);
    expect(items).toHaveLength(1);
    expect(Number(items[0].quantity)).toBe(180);
    expect(meal.recipeId).toBe(recipe.id);
    expect(recipe.deletedAt).toBeNull();
    // Defaulted, so a picker ordered by it never sorts a fresh recipe last.
    expect(recipe.lastUsedAt).toBeInstanceOf(Date);
  });

  it("keeps a meal's ingredients when its recipe is soft-deleted and unlinked", async () => {
    const userId = await seedUser();
    const productId = await seedProduct(userId);
    const [recipe] = await db
      .insert(recipes)
      .values({ userId, name: "Oats", nameSearch: "oats" })
      .returning();
    const [meal] = await db
      .insert(meals)
      .values({ userId, logDate: TODAY, recipeId: recipe.id })
      .returning();
    await db.insert(mealIngredients).values({
      mealId: meal.id,
      productId,
      quantity: "50.00",
      quantityUnit: "g",
      quantitySource: "manual",
    });

    await db.update(meals).set({ recipeId: null }).where(sql`${meals.id} = ${meal.id}`);
    await db.update(recipes).set({ deletedAt: new Date() }).where(sql`${recipes.id} = ${recipe.id}`);

    const rows = await db.select().from(mealIngredients);
    expect(rows).toHaveLength(1);
  });
});
