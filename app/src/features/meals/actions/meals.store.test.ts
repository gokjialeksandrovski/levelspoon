import { randomUUID } from "node:crypto";

import { eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { db } from "@/lib/db";
import { mealIngredients, meals, products, users } from "@/lib/db/schema";
import { toSearchText } from "@/lib/db/search-text";
import { todayLocalDateString } from "@/lib/date/day-bounds";

import { dailyKcalTotals } from "./meals.store";

const userId = randomUUID();
const TIMEZONE = "Europe/Berlin";
const today = todayLocalDateString(TIMEZONE);

// 200 kcal per 100 g, so 250 g of it is exactly 500 kcal - a figure a failing
// assertion can be read against without a calculator.
const PRODUCT_ENERGY_KCAL = "200";
const BASIS_QUANTITY = "100";
const QUANTITY_G = "250";
const EXPECTED_KCAL = 500;

let productId: string;

const insertMeal = async (deletedAt: Date | null = null): Promise<string> => {
  const [meal] = await db.insert(meals).values({ userId, deletedAt }).returning();
  return meal.id;
};

const insertIngredient = async (
  mealId: string,
  quantity = QUANTITY_G,
  deletedAt: Date | null = null,
): Promise<void> => {
  await db.insert(mealIngredients).values({
    mealId,
    productId,
    quantity,
    quantityUnit: "g",
    quantitySource: "manual",
    deletedAt,
  });
};

beforeAll(async () => {
  await db.insert(users).values({ id: userId, email: `meals-store-${userId}@test.local` });
  const [product] = await db
    .insert(products)
    .values({
      name: "Measured Burn Test Product",
      nameSearch: toSearchText("Measured Burn Test Product"),
      nutritionPhotoKey: `test/${randomUUID()}.jpg`,
      createdByUserId: userId,
      energyKcal: PRODUCT_ENERGY_KCAL,
      fatG: "0",
      saturatesG: "0",
      carbohydrateG: "0",
      sugarsG: "0",
      proteinG: "0",
      saltG: "0",
      nutritionBasisQuantity: BASIS_QUANTITY,
    })
    .returning();
  productId = product.id;
});

afterAll(async () => {
  // Ingredients first: meal_ingredients.meal_id is a plain foreign key with no
  // cascade, so deleting the meals out from under them is refused.
  await db.delete(mealIngredients).where(
    inArray(
      mealIngredients.mealId,
      db.select({ id: meals.id }).from(meals).where(eq(meals.userId, userId)),
    ),
  );
  await db.delete(meals).where(eq(meals.userId, userId));
  await db.delete(products).where(eq(products.createdByUserId, userId));
  await db.delete(users).where(eq(users.id, userId));
});

describe("dailyKcalTotals", () => {
  it("sums one local day's ingredients into a single row", async () => {
    const mealId = await insertMeal();
    await insertIngredient(mealId);
    await insertIngredient(mealId);

    const totals = await dailyKcalTotals(userId, today, today, TIMEZONE);

    expect(totals).toEqual([{ date: today, kcal: EXPECTED_KCAL * 2 }]);
  });

  it("counts a zero-calorie day as a logged day", async () => {
    const mealId = await insertMeal();
    await insertIngredient(mealId, "0");

    const totals = await dailyKcalTotals(userId, today, today, TIMEZONE);

    // A real logged day with nothing in it. It must appear with kcal 0, not
    // vanish - spec section 5 refuses to judge a day by its contents.
    const row = totals.find((total) => total.date === today);
    expect(row).toBeDefined();
  });

  it("ignores soft-deleted meals and soft-deleted ingredients", async () => {
    const deletedMealId = await insertMeal(new Date());
    await insertIngredient(deletedMealId);
    const liveMealId = await insertMeal();
    await insertIngredient(liveMealId, QUANTITY_G, new Date());

    const before = await dailyKcalTotals(userId, today, today, TIMEZONE);
    const liveMeal2 = await insertMeal();
    await insertIngredient(liveMeal2);
    const after = await dailyKcalTotals(userId, today, today, TIMEZONE);

    const total = (rows: { date: string; kcal: number }[]): number =>
      rows.find((row) => row.date === today)?.kcal ?? 0;
    // Only the one live ingredient added between the two reads moved the total.
    expect(total(after) - total(before)).toBeCloseTo(EXPECTED_KCAL, 6);
  });

  it("returns no row for a day with no meal", async () => {
    const totals = await dailyKcalTotals(userId, "2020-01-01", "2020-01-07", TIMEZONE);

    expect(totals).toEqual([]);
  });
});
