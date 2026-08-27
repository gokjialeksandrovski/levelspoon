import { sql } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";

import { db } from "@/lib/db";
import { meals, products, users } from "@/lib/db/schema";

import { computeContribution, saveMealIngredient } from "./meals";

beforeEach(async () => {
  await db.execute(sql`TRUNCATE TABLE products, meal_ingredients, meals, "user" CASCADE`);
});

describe("computeContribution", () => {
  it("scales per-100g values by quantity/100", () => {
    const contribution = computeContribution(
      {
        energyKcal: 70,
        fatG: 2.0,
        saturatesG: 1.2,
        carbohydrateG: 4.0,
        sugarsG: 4.0,
        proteinG: 9.0,
        saltG: 0.18,
      },
      150,
    );

    expect(contribution.energyKcal).toBeCloseTo(105, 5);
    expect(contribution.fatG).toBeCloseTo(3.0, 5);
    expect(contribution.saltG).toBeCloseTo(0.27, 5);
  });
});

describe("saveMealIngredient", () => {
  it("writes a meal_ingredients row with the given quantity and source", async () => {
    const [user] = await db.insert(users).values({ email: `t-${crypto.randomUUID()}@example.com` }).returning();
    const [product] = await db
      .insert(products)
      .values({
        name: "Test Product",
        energyKcal: "70",
        fatG: "2.0",
        saturatesG: "1.2",
        carbohydrateG: "4.0",
        sugarsG: "4.0",
        proteinG: "9.0",
        saltG: "0.18",
        nutritionPhotoKey: "test/placeholder.jpg",
        createdByUserId: user.id,
      })
      .returning();
    const [meal] = await db.insert(meals).values({ userId: user.id, name: "Breakfast" }).returning();

    const { mealIngredientId } = await saveMealIngredient({
      mealId: meal.id,
      productId: product.id,
      quantityG: 150,
      quantitySource: "manual",
    });

    expect(mealIngredientId).toBeTruthy();
  });
});
