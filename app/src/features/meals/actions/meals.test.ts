import { eq, sql } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockAuth = vi.fn();
vi.mock("@/auth", () => ({ auth: () => mockAuth() }));

import { saveDailyGoals } from "@/features/goals/actions/goals";
import { saveNutritionOverride } from "@/features/products/actions/products";
import { deleteRecipe, saveMealAsRecipe } from "@/features/recipes/actions/recipes";
import { db } from "@/lib/db";
import { mealIngredients, meals, products, users } from "@/lib/db/schema";
import { addCalendarDays, todayLocalDateString } from "@/lib/date/day-bounds";

import { computeContribution, HISTORY_PAGE_SIZE } from "./meals.utils";
import {
  createMeal,
  deleteMeal,
  discardEmptyMeal,
  getDayHistory,
  getDayLog,
  getMealDetail,
  recentAmounts,
  saveMealIngredient,
  removeMealIngredient,
  restoreMeal,
  restoreMealIngredient,
  updateMealIngredientQuantity,
} from "./meals";
import { InvalidLogDateError, NotAuthorizedError } from "./meals.errors";

// Every meal now names the day it counts towards, so the tests that are not
// about that day say "today" once here rather than restating it per call.
const TODAY = todayLocalDateString("UTC");
const YESTERDAY = addCalendarDays(TODAY, -1);

const seedUser = async (): Promise<string> => {
  const [user] = await db.insert(users).values({ email: `t-${crypto.randomUUID()}@example.com` }).returning();
  return user.id;
};

const seedProduct = async (
  userId: string,
  overrides: { servingUnit?: string | null; servingGrams?: number | null; densityGMl?: string | null } = {},
): Promise<string> => {
  const [product] = await db
    .insert(products)
    .values({
      name: "Test Product",
      nameSearch: "test product",
      energyKcal: "70",
      fatG: "2.0",
      saturatesG: "1.2",
      carbohydrateG: "4.0",
      sugarsG: "4.0",
      proteinG: "9.0",
      saltG: "0.18",
      nutritionPhotoKey: `test/${crypto.randomUUID()}.jpg`,
      createdByUserId: userId,
      servingUnit: overrides.servingUnit ?? null,
      servingGrams:
        overrides.servingGrams === undefined || overrides.servingGrams === null
          ? null
          : String(overrides.servingGrams),
      densityGMl: overrides.densityGMl ?? null,
    })
    .returning();
  return product.id;
};

beforeEach(async () => {
  await db.execute(
    sql`TRUNCATE TABLE recipe_items, recipes, products, product_overrides, meal_ingredients, meals, "user" CASCADE`,
  );
  mockAuth.mockReset();
});

describe("computeContribution", () => {
  it("scales per-100g values by quantity/basisQuantity", () => {
    const contribution = computeContribution(
      { energyKcal: 70, fatG: 2.0, saturatesG: 1.2, carbohydrateG: 4.0, sugarsG: 4.0, proteinG: 9.0, saltG: 0.18, fibreG: null },
      150,
      100,
    );

    expect(contribution.energyKcal).toBeCloseTo(105, 5);
    expect(contribution.fatG).toBeCloseTo(3.0, 5);
    expect(contribution.saltG).toBeCloseTo(0.27, 5);
  });

  it("scales a per-unit basis (e.g. per 1 tbsp) by quantity/basisQuantity", () => {
    const contribution = computeContribution(
      { energyKcal: 100, fatG: 9, saturatesG: 1.5, carbohydrateG: 3, sugarsG: 2, proteinG: 0, saltG: 0, fibreG: null },
      2,
      1,
    );

    expect(contribution.energyKcal).toBeCloseTo(200, 5);
    expect(contribution.fatG).toBeCloseTo(18, 5);
  });
});

describe("createMeal", () => {
  it("creates a meal owned by the authenticated user", async () => {
    const userId = await seedUser();
    mockAuth.mockResolvedValue({ user: { id: userId } });

    const { mealId } = await createMeal(TODAY, "UTC");

    const [row] = await db.select().from(meals).where(eq(meals.id, mealId));
    expect(row.userId).toBe(userId);
    expect(row.logDate).toBe(TODAY);
  });

  it("files the meal on the day it was given, which is the point of taking one", async () => {
    const userId = await seedUser();
    mockAuth.mockResolvedValue({ user: { id: userId } });

    const { mealId } = await createMeal("2026-01-01", "UTC");

    const [row] = await db.select().from(meals).where(eq(meals.id, mealId));
    expect(row.logDate).toBe("2026-01-01");
  });

  it("refuses a day the user cannot have eaten yet", async () => {
    const userId = await seedUser();
    mockAuth.mockResolvedValue({ user: { id: userId } });

    await expect(createMeal(addCalendarDays(TODAY, 1), "UTC")).rejects.toThrow(InvalidLogDateError);
  });

  it("refuses anything that is not a calendar date", async () => {
    const userId = await seedUser();
    mockAuth.mockResolvedValue({ user: { id: userId } });

    await expect(createMeal("yesterday", "UTC")).rejects.toThrow(InvalidLogDateError);
  });

  it("sweeps the caller's own empty meal on the next createMeal call", async () => {
    const userId = await seedUser();
    mockAuth.mockResolvedValue({ user: { id: userId } });
    const { mealId: staleEmpty } = await createMeal(TODAY, "UTC");

    const { mealId: fresh } = await createMeal(TODAY, "UTC");

    const ids = (await db.select({ id: meals.id }).from(meals)).map((row) => row.id);
    expect(ids).toEqual([fresh]);
    expect(ids).not.toContain(staleEmpty);
  });

  it("does not sweep a meal that has ingredients, nor another user's empty meal", async () => {
    const userId = await seedUser();
    const otherUserId = await seedUser();
    const productId = await seedProduct(userId);
    mockAuth.mockResolvedValue({ user: { id: otherUserId } });
    const { mealId: otherEmpty } = await createMeal(TODAY, "UTC");
    mockAuth.mockResolvedValue({ user: { id: userId } });
    const { mealId: filled } = await createMeal(TODAY, "UTC");
    await saveMealIngredient({ mealId: filled, productId, quantity: 100, quantityUnit: "g", quantitySource: "manual", entryCount: 100, entryUnit: "g" });

    await createMeal(TODAY, "UTC"); // sweep runs here

    const ids = (await db.select({ id: meals.id }).from(meals)).map((row) => row.id);
    expect(ids).toContain(filled);
    expect(ids).toContain(otherEmpty);
  });
});

describe("getMealDetail", () => {
  const insertMealAt = async (userId: string, logDate: string, iso: string): Promise<string> => {
    const [row] = await db.insert(meals).values({ userId, logDate, createdAt: new Date(iso) }).returning({ id: meals.id });
    return row.id;
  };

  it("returns the meal with its ingredients and total when the authenticated user owns it", async () => {
    const userId = await seedUser();
    const productId = await seedProduct(userId);
    mockAuth.mockResolvedValue({ user: { id: userId } });
    const { mealId } = await createMeal(TODAY, "UTC");
    await saveMealIngredient({ mealId, productId, quantity: 200, quantityUnit: "g", quantitySource: "manual", entryCount: 200, entryUnit: "g" });

    const meal = await getMealDetail(mealId);

    expect(meal?.ingredients).toHaveLength(1);
    expect(meal?.ingredients[0].productName).toBe("Test Product");
    expect(meal?.ingredients[0].quantity).toBe(200);
    expect(meal?.ingredients[0].quantityUnit).toBe("g");
    expect(meal?.total.energyKcal).toBeCloseTo(140, 5);
  });

  it("carries the entry echo so the row can print the words it was logged in", async () => {
    const userId = await seedUser();
    const productId = await seedProduct(userId);
    mockAuth.mockResolvedValue({ user: { id: userId } });
    const { mealId } = await createMeal(TODAY, "UTC");
    await saveMealIngredient({
      mealId, productId, quantity: 28, quantityUnit: "g",
      quantitySource: "manual", entryCount: 1, entryUnit: "slice",
    });

    const meal = await getMealDetail(mealId);

    expect(meal?.ingredients[0].entryCount).toBe(1);
    expect(meal?.ingredients[0].entryUnit).toBe("slice");
  });

  it("leaves the entry echo null for a row written before the columns existed", async () => {
    const userId = await seedUser();
    const productId = await seedProduct(userId);
    mockAuth.mockResolvedValue({ user: { id: userId } });
    const { mealId } = await createMeal(TODAY, "UTC");
    const { mealIngredientId } = await saveMealIngredient({
      mealId, productId, quantity: 150, quantityUnit: "g",
      quantitySource: "manual", entryCount: 150, entryUnit: "g",
    });
    await db
      .update(mealIngredients)
      .set({ entryCount: null, entryUnit: null })
      .where(eq(mealIngredients.id, mealIngredientId));

    const meal = await getMealDetail(mealId);

    expect(meal?.ingredients[0].entryCount).toBeNull();
    expect(meal?.ingredients[0].entryUnit).toBeNull();
  });

  it("returns an empty ingredient list and zero total for a meal with no ingredients yet", async () => {
    const userId = await seedUser();
    mockAuth.mockResolvedValue({ user: { id: userId } });
    const { mealId } = await createMeal(TODAY, "UTC");

    const meal = await getMealDetail(mealId);

    expect(meal?.ingredients).toEqual([]);
    expect(meal?.total.energyKcal).toBe(0);
  });

  it("returns null when a different user owns the meal", async () => {
    const ownerId = await seedUser();
    const intruderId = await seedUser();
    mockAuth.mockResolvedValue({ user: { id: ownerId } });
    const { mealId } = await createMeal(TODAY, "UTC");

    mockAuth.mockResolvedValue({ user: { id: intruderId } });
    const meal = await getMealDetail(mealId);

    expect(meal).toBeNull();
  });

  it("keeps ingredients in creation order after one is updated", async () => {
    const userId = await seedUser();
    const productId = await seedProduct(userId);
    mockAuth.mockResolvedValue({ user: { id: userId } });
    const { mealId } = await createMeal(TODAY, "UTC");
    const { mealIngredientId: firstId } = await saveMealIngredient({
      mealId, productId, quantity: 100, quantityUnit: "g", quantitySource: "manual", entryCount: 100, entryUnit: "g",
    });
    const { mealIngredientId: secondId } = await saveMealIngredient({
      mealId, productId, quantity: 200, quantityUnit: "g", quantitySource: "manual", entryCount: 200, entryUnit: "g",
    });
    const { mealIngredientId: thirdId } = await saveMealIngredient({
      mealId, productId, quantity: 300, quantityUnit: "g", quantitySource: "manual", entryCount: 300, entryUnit: "g",
    });

    await updateMealIngredientQuantity(firstId, 150, "g", 150, "g");

    const meal = await getMealDetail(mealId);

    expect(meal?.ingredients.map((ingredient) => ingredient.id)).toEqual([firstId, secondId, thirdId]);
  });

  it("numbers a meal by its position within its own local day", async () => {
    const userId = await seedUser();
    mockAuth.mockResolvedValue({ user: { id: userId } });
    const first = await insertMealAt(userId, "2026-03-10", "2026-03-10T08:00:00Z");
    await insertMealAt(userId, "2026-03-10", "2026-03-10T12:00:00Z");
    const third = await insertMealAt(userId, "2026-03-10", "2026-03-10T18:00:00Z");

    expect((await getMealDetail(first))?.mealNumber).toBe(1);
    expect((await getMealDetail(third))?.mealNumber).toBe(3);
  });

  // Regression: binding createdAt back as the upper bound dropped Postgres's
  // microseconds, so a defaultNow() meal excluded itself ("Meal 0").
  it("numbers a meal created by createMeal, whose timestamp carries sub-millisecond precision", async () => {
    const userId = await seedUser();
    mockAuth.mockResolvedValue({ user: { id: userId } });
    const { mealId } = await createMeal(TODAY, "UTC");

    expect((await getMealDetail(mealId))?.mealNumber).toBe(1);
  });

  it("renumbers after an earlier meal in the day is deleted", async () => {
    const userId = await seedUser();
    mockAuth.mockResolvedValue({ user: { id: userId } });
    const first = await insertMealAt(userId, "2026-03-10", "2026-03-10T08:00:00Z");
    const second = await insertMealAt(userId, "2026-03-10", "2026-03-10T12:00:00Z");

    await deleteMeal(first);

    expect((await getMealDetail(second))?.mealNumber).toBe(1);
  });

  it("scopes the number to the day the meal was logged for, not the day it was entered", async () => {
    const userId = await seedUser();
    mockAuth.mockResolvedValue({ user: { id: userId } });
    // Both entered on the 10th; the first one is yesterday's dinner, filled in
    // late, so it must not push the morning's meal to number two.
    await insertMealAt(userId, "2026-03-09", "2026-03-10T07:00:00Z");
    const firstOfLoggedDay = await insertMealAt(userId, "2026-03-10", "2026-03-10T08:00:00Z");

    expect((await getMealDetail(firstOfLoggedDay))?.mealNumber).toBe(1);
  });

  it("reports the day the meal was logged for as its date", async () => {
    const userId = await seedUser();
    mockAuth.mockResolvedValue({ user: { id: userId } });
    const mealId = await insertMealAt(userId, "2026-03-09", "2026-03-10T07:00:00Z");

    expect((await getMealDetail(mealId))?.date).toBe("2026-03-09");
  });

  it("carries the product's serving unit, serving weight, and density onto each ingredient", async () => {
    const userId = await seedUser();
    const productId = await seedProduct(userId, { servingUnit: "bar", servingGrams: 52, densityGMl: "1.2333" });
    mockAuth.mockResolvedValue({ user: { id: userId } });
    const { mealId } = await createMeal(TODAY, "UTC");
    await saveMealIngredient({ mealId, productId, quantity: 104, quantityUnit: "g", quantitySource: "manual", entryCount: 104, entryUnit: "g" });

    const meal = await getMealDetail(mealId);

    expect(meal?.ingredients[0].servingUnit).toBe("bar");
    expect(meal?.ingredients[0].servingGrams).toBe(52);
    expect(meal?.ingredients[0].densityGMl).toBeCloseTo(1.2333, 4);
  });

  it("computes contribution from a product's own basis quantity, not a hardcoded 100", async () => {
    const userId = await seedUser();
    const [product] = await db
      .insert(products)
      .values({
        name: "Nutella (per tbsp)",
        nameSearch: "nutella (per tbsp)",
        energyKcal: "100",
        fatG: "9",
        saturatesG: "3.5",
        carbohydrateG: "10",
        sugarsG: "10",
        proteinG: "1",
        saltG: "0.02",
        nutritionPhotoKey: "test/placeholder.jpg",
        createdByUserId: userId,
        nutritionBasisUnit: "tbsp",
        nutritionBasisQuantity: "1",
      })
      .returning();
    mockAuth.mockResolvedValue({ user: { id: userId } });
    const { mealId } = await createMeal(TODAY, "UTC");
    await saveMealIngredient({ mealId, productId: product.id, quantity: 2, quantityUnit: "tbsp", quantitySource: "manual", entryCount: 2, entryUnit: "tbsp" });

    const meal = await getMealDetail(mealId);

    expect(meal?.ingredients[0].quantityUnit).toBe("tbsp");
    expect(meal?.ingredients[0].contribution.energyKcal).toBeCloseTo(200, 5);
  });
});

describe("saveMealIngredient", () => {
  it("writes a meal_ingredients row for the meal's owner", async () => {
    const userId = await seedUser();
    const productId = await seedProduct(userId);
    mockAuth.mockResolvedValue({ user: { id: userId } });
    const { mealId } = await createMeal(TODAY, "UTC");

    const { mealIngredientId } = await saveMealIngredient({
      mealId,
      productId,
      quantity: 150, quantityUnit: "g",
      quantitySource: "manual",
      entryCount: 150, entryUnit: "g",
    });

    expect(mealIngredientId).toBeTruthy();
  });

  it("throws NotAuthorizedError when the meal belongs to a different user", async () => {
    const ownerId = await seedUser();
    const intruderId = await seedUser();
    const productId = await seedProduct(ownerId);
    mockAuth.mockResolvedValue({ user: { id: ownerId } });
    const { mealId } = await createMeal(TODAY, "UTC");

    mockAuth.mockResolvedValue({ user: { id: intruderId } });

    await expect(
      saveMealIngredient({ mealId, productId, quantity: 150, quantityUnit: "g", quantitySource: "manual", entryCount: 150, entryUnit: "g" }),
    ).rejects.toThrow(NotAuthorizedError);
  });
});

describe("getDayLog", () => {
  it("sums a user's meals within the local day only", async () => {
    const userId = await seedUser();
    const productId = await seedProduct(userId);
    mockAuth.mockResolvedValue({ user: { id: userId } });
    const { mealId } = await createMeal(TODAY, "UTC");
    await saveMealIngredient({ mealId, productId, quantity: 200, quantityUnit: "g", quantitySource: "manual", entryCount: 200, entryUnit: "g" });

    const log = await getDayLog(todayLocalDateString("UTC"), "UTC");

    expect(log.dayTotal.energyKcal).toBeCloseTo(140, 5);
    expect(log.meals).toEqual([
      { id: mealId, ingredientNames: ["Test Product"], total: log.dayTotal },
    ]);
  });

  it("reads the logging user's nutrition override, and only theirs", async () => {
    const userId = await seedUser();
    const productId = await seedProduct(userId);
    mockAuth.mockResolvedValue({ user: { id: userId } });
    const { mealId } = await createMeal(TODAY, "UTC");
    await saveMealIngredient({ mealId, productId, quantity: 200, quantityUnit: "g", quantitySource: "manual", entryCount: 200, entryUnit: "g" });
    await saveNutritionOverride(productId, {
      energyKcal: 140, fatG: 2.0, saturatesG: 1.2, carbohydrateG: 4.0, sugarsG: 4.0, proteinG: 9.0, saltG: 0.18, fibreG: null,
    });

    const corrected = await getDayLog(todayLocalDateString("UTC"), "UTC");
    expect(corrected.dayTotal.energyKcal).toBeCloseTo(280, 5);

    const otherUserId = await seedUser();
    mockAuth.mockResolvedValue({ user: { id: otherUserId } });
    const { mealId: otherMealId } = await createMeal(TODAY, "UTC");
    await saveMealIngredient({ mealId: otherMealId, productId, quantity: 200, quantityUnit: "g", quantitySource: "manual", entryCount: 200, entryUnit: "g" });

    const canonical = await getDayLog(todayLocalDateString("UTC"), "UTC");
    expect(canonical.dayTotal.energyKcal).toBeCloseTo(140, 5);
  });

  it("reads a user's fibre override for a product whose label had none", async () => {
    // coalesce(override, product) must surface the override, and the day total
    // must then count that ingredient as known rather than unknown.
    const userId = await seedUser();
    const productId = await seedProduct(userId);
    mockAuth.mockResolvedValue({ user: { id: userId } });
    const { mealId } = await createMeal(TODAY, "UTC");
    await saveMealIngredient({ mealId, productId, quantity: 100, quantityUnit: "g", quantitySource: "manual", entryCount: 100, entryUnit: "g" });

    const before = await getDayLog(TODAY, "UTC");
    expect(before.dayTotal.fibreG).toBeNull();
    expect(before.dayFibreCoverage).toEqual({ known: 0, total: 1 });

    await saveNutritionOverride(productId, {
      energyKcal: 70, fatG: 2.0, saturatesG: 1.2, carbohydrateG: 4.0, sugarsG: 4.0, proteinG: 9.0, saltG: 0.18, fibreG: 4,
    });

    const corrected = await getDayLog(TODAY, "UTC");
    expect(corrected.dayTotal.fibreG).toBe(4);
    expect(corrected.dayFibreCoverage).toEqual({ known: 1, total: 1 });
  });

  it("excludes a meal that has no ingredients", async () => {
    const userId = await seedUser();
    const productId = await seedProduct(userId);
    mockAuth.mockResolvedValue({ user: { id: userId } });
    const { mealId: filled } = await createMeal(TODAY, "UTC");
    await saveMealIngredient({ mealId: filled, productId, quantity: 100, quantityUnit: "g", quantitySource: "manual", entryCount: 100, entryUnit: "g" });
    await createMeal(TODAY, "UTC"); // empty

    const log = await getDayLog(todayLocalDateString("UTC"), "UTC");

    expect(log.meals.map((meal) => meal.id)).toEqual([filled]);
  });

  it("excludes meals logged for a different day", async () => {
    const userId = await seedUser();
    const productId = await seedProduct(userId);
    mockAuth.mockResolvedValue({ user: { id: userId } });
    const { mealId } = await createMeal(YESTERDAY, "UTC");
    await saveMealIngredient({
      mealId, productId, quantity: 200, quantityUnit: "g", quantitySource: "manual", entryCount: 200, entryUnit: "g",
    });

    const log = await getDayLog(TODAY, "UTC");

    expect(log.meals).toEqual([]);
    expect(log.dayTotal.energyKcal).toBe(0);
  });

  it("counts a meal entered today but logged for an earlier day against that day", async () => {
    const userId = await seedUser();
    const productId = await seedProduct(userId);
    mockAuth.mockResolvedValue({ user: { id: userId } });
    const { mealId } = await createMeal(YESTERDAY, "UTC");
    await saveMealIngredient({
      mealId, productId, quantity: 200, quantityUnit: "g", quantitySource: "manual", entryCount: 200, entryUnit: "g",
    });

    const yesterdayLog = await getDayLog(YESTERDAY, "UTC");

    expect(yesterdayLog.meals.map((meal) => meal.id)).toEqual([mealId]);
    expect(yesterdayLog.dayTotal.energyKcal).toBeCloseTo(140, 5);
  });

  // The day is a stored calendar date now, so it reads the same wherever the
  // reader is - a flight does not move a meal to the day before.
  it("reads the same day whatever timezone the request carries", async () => {
    const userId = await seedUser();
    const productId = await seedProduct(userId);
    mockAuth.mockResolvedValue({ user: { id: userId } });
    const { mealId } = await createMeal("2026-01-01", "UTC");
    await saveMealIngredient({
      mealId, productId, quantity: 100, quantityUnit: "g", quantitySource: "manual", entryCount: 100, entryUnit: "g",
    });

    expect((await getDayLog("2026-01-01", "Asia/Kolkata")).meals).toHaveLength(1);
    expect((await getDayLog("2026-01-02", "Asia/Kolkata")).meals).toEqual([]);
  });

  it("keeps meals in creation order after one of them is updated", async () => {
    const userId = await seedUser();
    const productId = await seedProduct(userId);
    mockAuth.mockResolvedValue({ user: { id: userId } });
    const seededDate = "2026-01-01";

    const { mealId: firstMealId } = await createMeal(seededDate, "UTC");
    const { mealIngredientId: firstIngredientId } = await saveMealIngredient({
      mealId: firstMealId, productId, quantity: 100, quantityUnit: "g", quantitySource: "manual", entryCount: 100, entryUnit: "g",
    });

    const { mealId: secondMealId } = await createMeal(seededDate, "UTC");
    await saveMealIngredient({
      mealId: secondMealId, productId, quantity: 200, quantityUnit: "g", quantitySource: "manual", entryCount: 200, entryUnit: "g",
    });

    const { mealId: thirdMealId } = await createMeal(seededDate, "UTC");
    await saveMealIngredient({
      mealId: thirdMealId, productId, quantity: 300, quantityUnit: "g", quantitySource: "manual", entryCount: 300, entryUnit: "g",
    });

    // Edit the first meal's ingredient - without an ORDER BY this can change
    // Postgres's natural row order and make "Breakfast" jump position.
    await updateMealIngredientQuantity(firstIngredientId, 150, "g", 150, "g");

    const log = await getDayLog(seededDate, "UTC");

    expect(log.meals.map((meal) => meal.id)).toEqual([firstMealId, secondMealId, thirdMealId]);
  });
});

describe("removeMealIngredient", () => {
  it("takes the ingredient off the meal and the day, and restoreMealIngredient puts it back", async () => {
    const userId = await seedUser();
    const productId = await seedProduct(userId);
    mockAuth.mockResolvedValue({ user: { id: userId } });
    const { mealId } = await createMeal(TODAY, "UTC");
    const { mealIngredientId } = await saveMealIngredient({
      mealId, productId, quantity: 200, quantityUnit: "g", quantitySource: "manual", entryCount: 200, entryUnit: "g",
    });
    const today = todayLocalDateString("UTC");

    await removeMealIngredient(mealIngredientId);

    expect((await getMealDetail(mealId))?.ingredients).toEqual([]);
    expect((await getDayLog(today, "UTC")).dayTotal.energyKcal).toBe(0);
    expect((await getDayHistory()).entries).toEqual([]);

    await restoreMealIngredient(mealIngredientId);

    expect((await getMealDetail(mealId))?.ingredients.map((ingredient) => ingredient.id)).toEqual([mealIngredientId]);
  });

  it("hard-deletes a removal older than the undo retention on the next createMeal sweep", async () => {
    const userId = await seedUser();
    const productId = await seedProduct(userId);
    mockAuth.mockResolvedValue({ user: { id: userId } });
    const { mealId } = await createMeal(TODAY, "UTC");
    const { mealIngredientId } = await saveMealIngredient({
      mealId, productId, quantity: 200, quantityUnit: "g", quantitySource: "manual", entryCount: 200, entryUnit: "g",
    });
    await db.update(mealIngredients).set({ deletedAt: sql`now() - interval '2 days'` }).where(eq(mealIngredients.id, mealIngredientId));

    await createMeal(TODAY, "UTC");

    expect(await db.select().from(mealIngredients).where(eq(mealIngredients.id, mealIngredientId))).toEqual([]);
  });

  it("throws NotAuthorizedError when a different user owns the meal", async () => {
    const ownerId = await seedUser();
    const intruderId = await seedUser();
    const productId = await seedProduct(ownerId);
    mockAuth.mockResolvedValue({ user: { id: ownerId } });
    const { mealId } = await createMeal(TODAY, "UTC");
    const { mealIngredientId } = await saveMealIngredient({
      mealId, productId, quantity: 200, quantityUnit: "g", quantitySource: "manual", entryCount: 200, entryUnit: "g",
    });

    mockAuth.mockResolvedValue({ user: { id: intruderId } });
    await expect(removeMealIngredient(mealIngredientId)).rejects.toThrow(NotAuthorizedError);
  });
});

describe("updateMealIngredientQuantity", () => {
  it("updates the quantity and marks the source manual, even if it was ai_estimated", async () => {
    const userId = await seedUser();
    const productId = await seedProduct(userId);
    mockAuth.mockResolvedValue({ user: { id: userId } });
    const { mealId } = await createMeal(TODAY, "UTC");
    const { mealIngredientId } = await saveMealIngredient({
      mealId, productId, quantity: 200, quantityUnit: "g", quantitySource: "ai_estimated", entryCount: 200, entryUnit: "g",
    });

    await updateMealIngredientQuantity(mealIngredientId, 100, "g", 100, "g");

    const [row] = await db.select().from(mealIngredients).where(eq(mealIngredients.id, mealIngredientId));
    expect(Number(row.quantity)).toBe(100);
    expect(row.quantitySource).toBe("manual");
  });

  it("throws NotAuthorizedError when a different user owns the meal", async () => {
    const ownerId = await seedUser();
    const intruderId = await seedUser();
    const productId = await seedProduct(ownerId);
    mockAuth.mockResolvedValue({ user: { id: ownerId } });
    const { mealId } = await createMeal(TODAY, "UTC");
    const { mealIngredientId } = await saveMealIngredient({
      mealId, productId, quantity: 200, quantityUnit: "g", quantitySource: "manual", entryCount: 200, entryUnit: "g",
    });

    mockAuth.mockResolvedValue({ user: { id: intruderId } });
    await expect(updateMealIngredientQuantity(mealIngredientId, 100, "g", 100, "g")).rejects.toThrow(NotAuthorizedError);
  });
});

describe("deleteMeal", () => {
  it("hides the meal from its detail, day and history, and restoreMeal brings it back", async () => {
    const userId = await seedUser();
    const productId = await seedProduct(userId);
    mockAuth.mockResolvedValue({ user: { id: userId } });
    const { mealId } = await createMeal(TODAY, "UTC");
    await saveMealIngredient({ mealId, productId, quantity: 100, quantityUnit: "g", quantitySource: "manual", entryCount: 100, entryUnit: "g" });
    const today = todayLocalDateString("UTC");

    await deleteMeal(mealId);

    expect(await getMealDetail(mealId)).toBeNull();
    expect((await getDayLog(today, "UTC")).meals).toEqual([]);
    expect((await getDayHistory()).entries).toEqual([]);

    await restoreMeal(mealId);

    expect((await getDayLog(today, "UTC")).meals.map((meal) => meal.id)).toEqual([mealId]);
  });

  it("hard-deletes a deleted meal and its ingredients once past the undo retention", async () => {
    const userId = await seedUser();
    const productId = await seedProduct(userId);
    mockAuth.mockResolvedValue({ user: { id: userId } });
    const { mealId } = await createMeal(TODAY, "UTC");
    await saveMealIngredient({ mealId, productId, quantity: 100, quantityUnit: "g", quantitySource: "manual", entryCount: 100, entryUnit: "g" });
    await db.update(meals).set({ deletedAt: sql`now() - interval '2 days'` }).where(eq(meals.id, mealId));

    await createMeal(TODAY, "UTC");

    expect(await db.select().from(meals).where(eq(meals.id, mealId))).toEqual([]);
    expect(await db.select().from(mealIngredients).where(eq(mealIngredients.mealId, mealId))).toEqual([]);
  });

  it("throws NotAuthorizedError when a different user restores the meal", async () => {
    const ownerId = await seedUser();
    const intruderId = await seedUser();
    mockAuth.mockResolvedValue({ user: { id: ownerId } });
    const { mealId } = await createMeal(TODAY, "UTC");
    await deleteMeal(mealId);

    mockAuth.mockResolvedValue({ user: { id: intruderId } });
    await expect(restoreMeal(mealId)).rejects.toThrow(NotAuthorizedError);
  });

  it("throws NotAuthorizedError when a different user owns the meal", async () => {
    const ownerId = await seedUser();
    const intruderId = await seedUser();
    mockAuth.mockResolvedValue({ user: { id: ownerId } });
    const { mealId } = await createMeal(TODAY, "UTC");

    mockAuth.mockResolvedValue({ user: { id: intruderId } });
    await expect(deleteMeal(mealId)).rejects.toThrow(NotAuthorizedError);
  });
});

describe("discardEmptyMeal", () => {
  it("deletes a meal that has no ingredients", async () => {
    const userId = await seedUser();
    mockAuth.mockResolvedValue({ user: { id: userId } });
    const { mealId } = await createMeal(TODAY, "UTC");

    await discardEmptyMeal(mealId);

    expect(await db.select().from(meals).where(eq(meals.id, mealId))).toEqual([]);
  });

  it("is a no-op for a meal that has ingredients", async () => {
    const userId = await seedUser();
    const productId = await seedProduct(userId);
    mockAuth.mockResolvedValue({ user: { id: userId } });
    const { mealId } = await createMeal(TODAY, "UTC");
    await saveMealIngredient({ mealId, productId, quantity: 100, quantityUnit: "g", quantitySource: "manual", entryCount: 100, entryUnit: "g" });

    await discardEmptyMeal(mealId);

    expect(await db.select().from(meals).where(eq(meals.id, mealId))).toHaveLength(1);
  });

  it("throws NotAuthorizedError when a different user owns the meal", async () => {
    const ownerId = await seedUser();
    const intruderId = await seedUser();
    mockAuth.mockResolvedValue({ user: { id: ownerId } });
    const { mealId } = await createMeal(TODAY, "UTC");

    mockAuth.mockResolvedValue({ user: { id: intruderId } });
    await expect(discardEmptyMeal(mealId)).rejects.toThrow(NotAuthorizedError);
  });
});

describe("getDayHistory", () => {
  it("groups a user's meals by local calendar day, most recent first", async () => {
    const userId = await seedUser();
    const productId = await seedProduct(userId);
    mockAuth.mockResolvedValue({ user: { id: userId } });
    const { mealId: today } = await createMeal(TODAY, "UTC");
    await saveMealIngredient({ mealId: today, productId, quantity: 100, quantityUnit: "g", quantitySource: "manual", entryCount: 100, entryUnit: "g" });
    const { mealId: yesterday } = await createMeal(YESTERDAY, "UTC");
    await saveMealIngredient({
      mealId: yesterday, productId, quantity: 200, quantityUnit: "g", quantitySource: "manual", entryCount: 200, entryUnit: "g",
    });

    const page = await getDayHistory();

    expect(page.entries).toHaveLength(2);
    expect(page.entries[0].totalKcal).toBeCloseTo(70, 5); // today, most recent first
    expect(page.entries[1].totalKcal).toBeCloseTo(140, 5); // yesterday
    expect(page.nextOffset).toBeNull();
    expect(page.calorieGoal).toBeNull();
  });

  it("totals a corrected product the way its author sees it, and nobody else's", async () => {
    const userId = await seedUser();
    const productId = await seedProduct(userId);
    mockAuth.mockResolvedValue({ user: { id: userId } });
    const { mealId } = await createMeal(TODAY, "UTC");
    await saveMealIngredient({ mealId, productId, quantity: 200, quantityUnit: "g", quantitySource: "manual", entryCount: 200, entryUnit: "g" });
    await saveNutritionOverride(productId, {
      energyKcal: 140, fatG: 2.0, saturatesG: 1.2, carbohydrateG: 4.0, sugarsG: 4.0, proteinG: 9.0, saltG: 0.18, fibreG: null,
    });

    const corrected = await getDayHistory();
    expect(corrected.entries[0].totalKcal).toBeCloseTo(280, 5);

    const otherUserId = await seedUser();
    mockAuth.mockResolvedValue({ user: { id: otherUserId } });
    const { mealId: otherMealId } = await createMeal(TODAY, "UTC");
    await saveMealIngredient({ mealId: otherMealId, productId, quantity: 200, quantityUnit: "g", quantitySource: "manual", entryCount: 200, entryUnit: "g" });

    const canonical = await getDayHistory();
    expect(canonical.entries[0].totalKcal).toBeCloseTo(140, 5);
  });

  it("carries the user's calorie goal so rows can be compared against it", async () => {
    const userId = await seedUser();
    const productId = await seedProduct(userId);
    mockAuth.mockResolvedValue({ user: { id: userId } });
    const { mealId } = await createMeal(TODAY, "UTC");
    await saveMealIngredient({ mealId, productId, quantity: 100, quantityUnit: "g", quantitySource: "manual", entryCount: 100, entryUnit: "g" });
    await saveDailyGoals(2400, null);

    const page = await getDayHistory();

    expect(page.calorieGoal).toBe(2400);
  });

  it("reports the day each meal was logged for, not the day it was entered", async () => {
    const userId = await seedUser();
    const productId = await seedProduct(userId);
    mockAuth.mockResolvedValue({ user: { id: userId } });
    const { mealId } = await createMeal("2026-01-01", "UTC");
    await saveMealIngredient({
      mealId, productId, quantity: 100, quantityUnit: "g", quantitySource: "manual", entryCount: 100, entryUnit: "g",
    });

    const page = await getDayHistory();

    expect(page.entries).toHaveLength(1);
    expect(page.entries[0].date).toBe("2026-01-01");
  });

  it("paginates at HISTORY_PAGE_SIZE and reports a null nextOffset on the last page", async () => {
    const userId = await seedUser();
    const productId = await seedProduct(userId);
    mockAuth.mockResolvedValue({ user: { id: userId } });
    for (let daysAgo = 0; daysAgo < HISTORY_PAGE_SIZE + 1; daysAgo += 1) {
      const { mealId } = await createMeal(addCalendarDays(TODAY, -daysAgo), "UTC");
      await saveMealIngredient({
        mealId, productId, quantity: 100, quantityUnit: "g", quantitySource: "manual", entryCount: 100, entryUnit: "g",
      });
    }

    const firstPage = await getDayHistory();
    expect(firstPage.entries).toHaveLength(HISTORY_PAGE_SIZE);
    expect(firstPage.nextOffset).toBe(HISTORY_PAGE_SIZE);

    const secondPage = await getDayHistory(firstPage.nextOffset ?? 0);
    expect(secondPage.entries).toHaveLength(1);
    expect(secondPage.nextOffset).toBeNull();
  });

  it("uses a product's own basis quantity in the SQL total, not a hardcoded /100", async () => {
    const userId = await seedUser();
    const [product] = await db
      .insert(products)
      .values({
        name: "Nutella (per tbsp)",
        nameSearch: "nutella (per tbsp)",
        energyKcal: "100",
        fatG: "9",
        saturatesG: "3.5",
        carbohydrateG: "10",
        sugarsG: "10",
        proteinG: "1",
        saltG: "0.02",
        nutritionPhotoKey: "test/placeholder.jpg",
        createdByUserId: userId,
        nutritionBasisUnit: "tbsp",
        nutritionBasisQuantity: "1",
      })
      .returning();
    mockAuth.mockResolvedValue({ user: { id: userId } });
    const { mealId } = await createMeal(TODAY, "UTC");
    await saveMealIngredient({ mealId, productId: product.id, quantity: 2, quantityUnit: "tbsp", quantitySource: "manual", entryCount: 2, entryUnit: "tbsp" });

    const page = await getDayHistory();

    expect(page.entries[0].totalKcal).toBeCloseTo(200, 5);
  });
});

describe("entry echo columns", () => {
  const seedMealAndProduct = async (): Promise<{ mealId: string; productId: string }> => {
    const userId = await seedUser();
    const productId = await seedProduct(userId);
    mockAuth.mockResolvedValue({ user: { id: userId } });
    const { mealId } = await createMeal(TODAY, "UTC");
    return { mealId, productId };
  };

  it("records the count and unit the user actually entered", async () => {
    const { mealId, productId } = await seedMealAndProduct();
    const { mealIngredientId } = await saveMealIngredient({
      mealId, productId, quantity: 28, quantityUnit: "g",
      quantitySource: "manual", entryCount: 1, entryUnit: "slice",
    });

    const [row] = await db
      .select({
        quantity: mealIngredients.quantity,
        quantityUnit: mealIngredients.quantityUnit,
        entryCount: mealIngredients.entryCount,
        entryUnit: mealIngredients.entryUnit,
      })
      .from(mealIngredients)
      .where(eq(mealIngredients.id, mealIngredientId));

    expect(row.quantity).toBe("28.00");
    expect(row.quantityUnit).toBe("g");
    expect(row.entryCount).toBe("1.00");
    expect(row.entryUnit).toBe("slice");
  });

  it("echoes a plain gram entry as itself", async () => {
    const { mealId, productId } = await seedMealAndProduct();
    const { mealIngredientId } = await saveMealIngredient({
      mealId, productId, quantity: 150, quantityUnit: "g",
      quantitySource: "manual", entryCount: 150, entryUnit: "g",
    });
    const [row] = await db
      .select({ entryCount: mealIngredients.entryCount, entryUnit: mealIngredients.entryUnit })
      .from(mealIngredients)
      .where(eq(mealIngredients.id, mealIngredientId));
    expect(row.entryCount).toBe("150.00");
    expect(row.entryUnit).toBe("g");
  });

  it("rewrites the echo when the amount is edited", async () => {
    const { mealId, productId } = await seedMealAndProduct();
    const { mealIngredientId } = await saveMealIngredient({
      mealId, productId, quantity: 28, quantityUnit: "g",
      quantitySource: "manual", entryCount: 1, entryUnit: "slice",
    });
    await updateMealIngredientQuantity(mealIngredientId, 56, "g", 2, "slice");
    const [row] = await db
      .select({ entryCount: mealIngredients.entryCount, entryUnit: mealIngredients.entryUnit })
      .from(mealIngredients)
      .where(eq(mealIngredients.id, mealIngredientId));
    expect(row.entryCount).toBe("2.00");
    expect(row.entryUnit).toBe("slice");
  });
});

describe("recentAmounts", () => {
  let mealId: string;
  let productId: string;

  const log = (entryCount: number, entryUnit: string, quantity: number) =>
    saveMealIngredient({
      mealId, productId, quantity, quantityUnit: "g",
      quantitySource: "manual", entryCount, entryUnit,
    });

  beforeEach(async () => {
    const userId = await seedUser();
    productId = await seedProduct(userId);
    mockAuth.mockResolvedValue({ user: { id: userId } });
    ({ mealId } = await createMeal(TODAY, "UTC"));
  });

  it("returns nothing for a product never logged", async () => {
    expect(await recentAmounts(productId)).toEqual([]);
  });

  it("collapses a repeat of the same amount to one chip", async () => {
    await log(1, "slice", 28);
    await log(1, "slice", 28);
    expect(await recentAmounts(productId)).toEqual([{ count: 1, unit: "slice", grams: 28 }]);
  });

  it("keeps two counts of the same unit apart", async () => {
    await log(200, "g", 200);
    await log(250, "g", 250);
    expect(await recentAmounts(productId)).toEqual([
      { count: 250, unit: "g", grams: 250 },
      { count: 200, unit: "g", grams: 200 },
    ]);
  });

  it("returns distinct amounts newest first, a repeat not costing a slot", async () => {
    await log(200, "g", 200);
    await log(250, "g", 250);
    await log(2, "cup", 480);
    await log(3, "tbsp", 41);
    await log(200, "g", 200);
    await log(250, "g", 250);
    expect(await recentAmounts(productId)).toEqual([
      { count: 250, unit: "g", grams: 250 },
      { count: 200, unit: "g", grams: 200 },
      { count: 3, unit: "tbsp", grams: 41 },
      { count: 2, unit: "cup", grams: 480 },
    ]);
  });

  it("keeps only five even when six amounts were used", async () => {
    await log(50, "g", 50);
    await log(100, "g", 100);
    await log(150, "g", 150);
    await log(1, "cup", 240);
    await log(1, "slice", 28);
    await log(2, "slice", 56);
    const recents = await recentAmounts(productId);
    expect(recents).toHaveLength(5);
    expect(recents.map((recent) => `${recent.count} ${recent.unit}`)).toEqual([
      "2 slice",
      "1 slice",
      "1 cup",
      "150 g",
      "100 g",
    ]);
  });

  it("ignores a removed ingredient", async () => {
    const { mealIngredientId } = await log(1, "slice", 28);
    await removeMealIngredient(mealIngredientId);
    expect(await recentAmounts(productId)).toEqual([]);
  });

  it("does not leak another user's history", async () => {
    await log(1, "slice", 28);
    const otherUserId = await seedUser();
    mockAuth.mockResolvedValue({ user: { id: otherUserId } });
    expect(await recentAmounts(productId)).toEqual([]);
  });
});

describe("getMealDetail recipe link", () => {
  it("is null for an ordinary meal", async () => {
    const userId = await seedUser();
    mockAuth.mockResolvedValue({ user: { id: userId } });
    const productId = await seedProduct(userId);
    const { mealId } = await createMeal(TODAY, "UTC");
    await saveMealIngredient({ mealId, productId, quantity: 200, quantityUnit: "g", quantitySource: "manual", entryCount: 200, entryUnit: "g" });

    const meal = await getMealDetail(mealId);
    expect(meal?.recipe).toBeNull();
  });

  it("names the recipe and reports a match for a meal that still equals it", async () => {
    const userId = await seedUser();
    mockAuth.mockResolvedValue({ user: { id: userId } });
    const productId = await seedProduct(userId);
    const { mealId } = await createMeal(TODAY, "UTC");
    await saveMealIngredient({ mealId, productId, quantity: 200, quantityUnit: "g", quantitySource: "manual", entryCount: 200, entryUnit: "g" });
    const saved = await saveMealAsRecipe(mealId, "Yogurt");
    if (saved.kind !== "saved") throw new Error(saved.kind);

    const meal = await getMealDetail(mealId);
    expect(meal?.recipe).toEqual({ id: saved.recipeId, name: "Yogurt", matches: true, recipeIsSubset: true, isAiEstimate: false });
  });

  it("reports no match once an ingredient is edited", async () => {
    const userId = await seedUser();
    mockAuth.mockResolvedValue({ user: { id: userId } });
    const productId = await seedProduct(userId);
    const { mealId } = await createMeal(TODAY, "UTC");
    const { mealIngredientId } = await saveMealIngredient({ mealId, productId, quantity: 200, quantityUnit: "g", quantitySource: "manual", entryCount: 200, entryUnit: "g" });
    await saveMealAsRecipe(mealId, "Yogurt");

    await updateMealIngredientQuantity(mealIngredientId, 250, "g", 250, "g");

    const meal = await getMealDetail(mealId);
    expect(meal?.recipe?.matches).toBe(false);
    // Genuine drift, not an addition - a changed amount is not a subset either.
    expect(meal?.recipe?.recipeIsSubset).toBe(false);
  });

  // [Finding 3] The recipe survives whole, plus this extra row - the "picked
  // a recipe into a meal that already held something" shape the divergence
  // line must not fire on, even though `matches` is still (correctly) false.
  it("still reports the recipe as a subset once an ingredient is added on top of it", async () => {
    const userId = await seedUser();
    mockAuth.mockResolvedValue({ user: { id: userId } });
    const productId = await seedProduct(userId);
    const other = await seedProduct(userId);
    const { mealId } = await createMeal(TODAY, "UTC");
    await saveMealIngredient({ mealId, productId, quantity: 200, quantityUnit: "g", quantitySource: "manual", entryCount: 200, entryUnit: "g" });
    await saveMealAsRecipe(mealId, "Yogurt");

    await saveMealIngredient({ mealId, productId: other, quantity: 10, quantityUnit: "g", quantitySource: "manual", entryCount: 10, entryUnit: "g" });

    const meal = await getMealDetail(mealId);
    expect(meal?.recipe?.matches).toBe(false);
    expect(meal?.recipe?.recipeIsSubset).toBe(true);
  });

  it("is null again once the recipe is deleted, with the food kept", async () => {
    const userId = await seedUser();
    mockAuth.mockResolvedValue({ user: { id: userId } });
    const productId = await seedProduct(userId);
    const { mealId } = await createMeal(TODAY, "UTC");
    await saveMealIngredient({ mealId, productId, quantity: 200, quantityUnit: "g", quantitySource: "manual", entryCount: 200, entryUnit: "g" });
    const saved = await saveMealAsRecipe(mealId, "Yogurt");
    if (saved.kind !== "saved") throw new Error(saved.kind);

    await deleteRecipe(saved.recipeId);

    const meal = await getMealDetail(mealId);
    expect(meal?.recipe).toBeNull();
    expect(meal?.ingredients).toHaveLength(1);
  });
});
