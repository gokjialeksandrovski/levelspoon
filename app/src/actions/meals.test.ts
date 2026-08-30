import { eq, sql } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockAuth = vi.fn();
vi.mock("@/auth", () => ({ auth: () => mockAuth() }));

import { db } from "@/lib/db";
import { mealIngredients, meals, products, users } from "@/lib/db/schema";
import { todayLocalDateString } from "@/lib/date/day-bounds";

import { computeContribution, HISTORY_PAGE_SIZE } from "./meals.utils";
import {
  createMeal,
  getDayHistory,
  getDayLog,
  getMealDetail,
  saveMealIngredient,
  removeMealIngredient,
  updateMealIngredientQuantity,
} from "./meals";
import { NotAuthorizedError } from "./meals.errors";

const seedUser = async (): Promise<string> => {
  const [user] = await db.insert(users).values({ email: `t-${crypto.randomUUID()}@example.com` }).returning();
  return user.id;
};

const seedProduct = async (userId: string): Promise<string> => {
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
      createdByUserId: userId,
    })
    .returning();
  return product.id;
};

beforeEach(async () => {
  await db.execute(sql`TRUNCATE TABLE products, meal_ingredients, meals, "user" CASCADE`);
  mockAuth.mockReset();
});

describe("computeContribution", () => {
  it("scales per-100g values by quantity/100", () => {
    const contribution = computeContribution(
      { energyKcal: 70, fatG: 2.0, saturatesG: 1.2, carbohydrateG: 4.0, sugarsG: 4.0, proteinG: 9.0, saltG: 0.18 },
      150,
    );

    expect(contribution.energyKcal).toBeCloseTo(105, 5);
    expect(contribution.fatG).toBeCloseTo(3.0, 5);
    expect(contribution.saltG).toBeCloseTo(0.27, 5);
  });
});

describe("createMeal", () => {
  it("creates a meal owned by the authenticated user", async () => {
    const userId = await seedUser();
    mockAuth.mockResolvedValue({ user: { id: userId } });

    const { mealId } = await createMeal();

    const [row] = await db.select().from(meals).where(eq(meals.id, mealId));
    expect(row.userId).toBe(userId);
  });

  it("sweeps the caller's own empty meal on the next createMeal call", async () => {
    const userId = await seedUser();
    mockAuth.mockResolvedValue({ user: { id: userId } });
    const { mealId: staleEmpty } = await createMeal();

    const { mealId: fresh } = await createMeal();

    const ids = (await db.select({ id: meals.id }).from(meals)).map((row) => row.id);
    expect(ids).toEqual([fresh]);
    expect(ids).not.toContain(staleEmpty);
  });

  it("does not sweep a meal that has ingredients, nor another user's empty meal", async () => {
    const userId = await seedUser();
    const otherUserId = await seedUser();
    const productId = await seedProduct(userId);
    mockAuth.mockResolvedValue({ user: { id: otherUserId } });
    const { mealId: otherEmpty } = await createMeal();
    mockAuth.mockResolvedValue({ user: { id: userId } });
    const { mealId: filled } = await createMeal();
    await saveMealIngredient({ mealId: filled, productId, quantityG: 100, quantitySource: "manual" });

    await createMeal(); // sweep runs here

    const ids = (await db.select({ id: meals.id }).from(meals)).map((row) => row.id);
    expect(ids).toContain(filled);
    expect(ids).toContain(otherEmpty);
  });
});

describe("getMealDetail", () => {
  it("returns the meal with its ingredients and total when the authenticated user owns it", async () => {
    const userId = await seedUser();
    const productId = await seedProduct(userId);
    mockAuth.mockResolvedValue({ user: { id: userId } });
    const { mealId } = await createMeal();
    await saveMealIngredient({ mealId, productId, quantityG: 200, quantitySource: "manual" });

    const meal = await getMealDetail(mealId);

    expect(meal?.ingredients).toHaveLength(1);
    expect(meal?.ingredients[0].productName).toBe("Test Product");
    expect(meal?.ingredients[0].quantityG).toBe(200);
    expect(meal?.total.energyKcal).toBeCloseTo(140, 5);
  });

  it("returns an empty ingredient list and zero total for a meal with no ingredients yet", async () => {
    const userId = await seedUser();
    mockAuth.mockResolvedValue({ user: { id: userId } });
    const { mealId } = await createMeal();

    const meal = await getMealDetail(mealId);

    expect(meal?.ingredients).toEqual([]);
    expect(meal?.total.energyKcal).toBe(0);
  });

  it("returns null when a different user owns the meal", async () => {
    const ownerId = await seedUser();
    const intruderId = await seedUser();
    mockAuth.mockResolvedValue({ user: { id: ownerId } });
    const { mealId } = await createMeal();

    mockAuth.mockResolvedValue({ user: { id: intruderId } });
    const meal = await getMealDetail(mealId);

    expect(meal).toBeNull();
  });

  it("keeps ingredients in creation order after one is updated", async () => {
    const userId = await seedUser();
    const productId = await seedProduct(userId);
    mockAuth.mockResolvedValue({ user: { id: userId } });
    const { mealId } = await createMeal();
    const { mealIngredientId: firstId } = await saveMealIngredient({
      mealId, productId, quantityG: 100, quantitySource: "manual",
    });
    const { mealIngredientId: secondId } = await saveMealIngredient({
      mealId, productId, quantityG: 200, quantitySource: "manual",
    });
    const { mealIngredientId: thirdId } = await saveMealIngredient({
      mealId, productId, quantityG: 300, quantitySource: "manual",
    });

    await updateMealIngredientQuantity(firstId, 150);

    const meal = await getMealDetail(mealId);

    expect(meal?.ingredients.map((ingredient) => ingredient.id)).toEqual([firstId, secondId, thirdId]);
  });
});

describe("saveMealIngredient", () => {
  it("writes a meal_ingredients row for the meal's owner", async () => {
    const userId = await seedUser();
    const productId = await seedProduct(userId);
    mockAuth.mockResolvedValue({ user: { id: userId } });
    const { mealId } = await createMeal();

    const { mealIngredientId } = await saveMealIngredient({
      mealId,
      productId,
      quantityG: 150,
      quantitySource: "manual",
    });

    expect(mealIngredientId).toBeTruthy();
  });

  it("throws NotAuthorizedError when the meal belongs to a different user", async () => {
    const ownerId = await seedUser();
    const intruderId = await seedUser();
    const productId = await seedProduct(ownerId);
    mockAuth.mockResolvedValue({ user: { id: ownerId } });
    const { mealId } = await createMeal();

    mockAuth.mockResolvedValue({ user: { id: intruderId } });

    await expect(
      saveMealIngredient({ mealId, productId, quantityG: 150, quantitySource: "manual" }),
    ).rejects.toThrow(NotAuthorizedError);
  });
});

describe("getDayLog", () => {
  it("sums a user's meals within the local day only", async () => {
    const userId = await seedUser();
    const productId = await seedProduct(userId);
    mockAuth.mockResolvedValue({ user: { id: userId } });
    const { mealId } = await createMeal();
    await saveMealIngredient({ mealId, productId, quantityG: 200, quantitySource: "manual" });

    const log = await getDayLog(todayLocalDateString("UTC"), "UTC");

    expect(log.dayTotal.energyKcal).toBeCloseTo(140, 5);
    expect(log.meals.map((meal) => meal.id)).toEqual([mealId]);
  });

  it("excludes meals from a different local day", async () => {
    const userId = await seedUser();
    const productId = await seedProduct(userId);
    mockAuth.mockResolvedValue({ user: { id: userId } });
    const { mealId } = await createMeal();
    const { mealIngredientId } = await saveMealIngredient({
      mealId, productId, quantityG: 200, quantitySource: "manual",
    });
    const ONE_DAY_MS = 24 * 60 * 60 * 1000;
    await db
      .update(mealIngredients)
      .set({ createdAt: new Date(Date.now() - ONE_DAY_MS) })
      .where(eq(mealIngredients.id, mealIngredientId));

    const log = await getDayLog(todayLocalDateString("UTC"), "UTC");

    expect(log.meals).toEqual([]);
    expect(log.dayTotal.energyKcal).toBe(0);
  });

  it("assigns a late-evening UTC entry to the correct local day in a positive-offset timezone", async () => {
    const userId = await seedUser();
    const productId = await seedProduct(userId);
    mockAuth.mockResolvedValue({ user: { id: userId } });
    const { mealId } = await createMeal();
    const { mealIngredientId } = await saveMealIngredient({
      mealId, productId, quantityG: 100, quantitySource: "manual",
    });
    // 2026-01-01T22:00:00Z is already 2026-01-02 local in Asia/Kolkata (UTC+5:30) -
    // exactly the bug getDayLog exists to fix.
    await db
      .update(mealIngredients)
      .set({ createdAt: new Date("2026-01-01T22:00:00Z") })
      .where(eq(mealIngredients.id, mealIngredientId));

    const sameUtcDayLog = await getDayLog("2026-01-01", "Asia/Kolkata");
    const nextLocalDayLog = await getDayLog("2026-01-02", "Asia/Kolkata");

    expect(sameUtcDayLog.meals).toEqual([]);
    expect(nextLocalDayLog.meals).toHaveLength(1);
  });

  it("keeps meals in creation order after one of them is updated", async () => {
    const userId = await seedUser();
    const productId = await seedProduct(userId);
    mockAuth.mockResolvedValue({ user: { id: userId } });
    const seededDate = "2026-01-01";

    const { mealId: firstMealId } = await createMeal();
    await db.update(meals).set({ createdAt: new Date("2026-01-01T08:00:00Z") }).where(eq(meals.id, firstMealId));
    const { mealIngredientId: firstIngredientId } = await saveMealIngredient({
      mealId: firstMealId, productId, quantityG: 100, quantitySource: "manual",
    });
    await db
      .update(mealIngredients)
      .set({ createdAt: new Date("2026-01-01T08:00:00Z") })
      .where(eq(mealIngredients.id, firstIngredientId));

    const { mealId: secondMealId } = await createMeal();
    await db.update(meals).set({ createdAt: new Date("2026-01-01T12:00:00Z") }).where(eq(meals.id, secondMealId));
    const { mealIngredientId: secondIngredientId } = await saveMealIngredient({
      mealId: secondMealId, productId, quantityG: 200, quantitySource: "manual",
    });
    await db
      .update(mealIngredients)
      .set({ createdAt: new Date("2026-01-01T12:00:00Z") })
      .where(eq(mealIngredients.id, secondIngredientId));

    const { mealId: thirdMealId } = await createMeal();
    await db.update(meals).set({ createdAt: new Date("2026-01-01T18:00:00Z") }).where(eq(meals.id, thirdMealId));
    const { mealIngredientId: thirdIngredientId } = await saveMealIngredient({
      mealId: thirdMealId, productId, quantityG: 300, quantitySource: "manual",
    });
    await db
      .update(mealIngredients)
      .set({ createdAt: new Date("2026-01-01T18:00:00Z") })
      .where(eq(mealIngredients.id, thirdIngredientId));

    // Edit the first meal's ingredient - without an ORDER BY this can change
    // Postgres's natural row order and make "Breakfast" jump position.
    await updateMealIngredientQuantity(firstIngredientId, 150);

    const log = await getDayLog(seededDate, "UTC");

    expect(log.meals.map((meal) => meal.id)).toEqual([firstMealId, secondMealId, thirdMealId]);
  });
});

describe("removeMealIngredient", () => {
  it("deletes the ingredient when the authenticated user owns the meal", async () => {
    const userId = await seedUser();
    const productId = await seedProduct(userId);
    mockAuth.mockResolvedValue({ user: { id: userId } });
    const { mealId } = await createMeal();
    const { mealIngredientId } = await saveMealIngredient({
      mealId, productId, quantityG: 200, quantitySource: "manual",
    });

    await removeMealIngredient(mealIngredientId);

    const rows = await db.select().from(mealIngredients).where(eq(mealIngredients.id, mealIngredientId));
    expect(rows).toEqual([]);
  });

  it("throws NotAuthorizedError when a different user owns the meal", async () => {
    const ownerId = await seedUser();
    const intruderId = await seedUser();
    const productId = await seedProduct(ownerId);
    mockAuth.mockResolvedValue({ user: { id: ownerId } });
    const { mealId } = await createMeal();
    const { mealIngredientId } = await saveMealIngredient({
      mealId, productId, quantityG: 200, quantitySource: "manual",
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
    const { mealId } = await createMeal();
    const { mealIngredientId } = await saveMealIngredient({
      mealId, productId, quantityG: 200, quantitySource: "ai_estimated",
    });

    await updateMealIngredientQuantity(mealIngredientId, 100);

    const [row] = await db.select().from(mealIngredients).where(eq(mealIngredients.id, mealIngredientId));
    expect(Number(row.quantityG)).toBe(100);
    expect(row.quantitySource).toBe("manual");
  });

  it("throws NotAuthorizedError when a different user owns the meal", async () => {
    const ownerId = await seedUser();
    const intruderId = await seedUser();
    const productId = await seedProduct(ownerId);
    mockAuth.mockResolvedValue({ user: { id: ownerId } });
    const { mealId } = await createMeal();
    const { mealIngredientId } = await saveMealIngredient({
      mealId, productId, quantityG: 200, quantitySource: "manual",
    });

    mockAuth.mockResolvedValue({ user: { id: intruderId } });
    await expect(updateMealIngredientQuantity(mealIngredientId, 100)).rejects.toThrow(NotAuthorizedError);
  });
});

describe("getDayHistory", () => {
  it("groups a user's meals by local calendar day, most recent first", async () => {
    const userId = await seedUser();
    const productId = await seedProduct(userId);
    mockAuth.mockResolvedValue({ user: { id: userId } });
    const { mealId: today } = await createMeal();
    await saveMealIngredient({ mealId: today, productId, quantityG: 100, quantitySource: "manual" });
    const { mealId: yesterday } = await createMeal();
    const { mealIngredientId } = await saveMealIngredient({
      mealId: yesterday, productId, quantityG: 200, quantitySource: "manual",
    });
    const ONE_DAY_MS = 24 * 60 * 60 * 1000;
    await db
      .update(mealIngredients)
      .set({ createdAt: new Date(Date.now() - ONE_DAY_MS) })
      .where(eq(mealIngredients.id, mealIngredientId));

    const page = await getDayHistory("UTC");

    expect(page.entries).toHaveLength(2);
    expect(page.entries[0].totalKcal).toBeCloseTo(70, 5); // today, most recent first
    expect(page.entries[1].totalKcal).toBeCloseTo(140, 5); // yesterday
    expect(page.nextOffset).toBeNull();
  });

  it("groups a late-evening UTC entry into the correct local day", async () => {
    const userId = await seedUser();
    const productId = await seedProduct(userId);
    mockAuth.mockResolvedValue({ user: { id: userId } });
    const { mealId } = await createMeal();
    const { mealIngredientId } = await saveMealIngredient({
      mealId, productId, quantityG: 100, quantitySource: "manual",
    });
    await db
      .update(mealIngredients)
      .set({ createdAt: new Date("2026-01-01T22:00:00Z") }) // 2026-01-02 local in Asia/Kolkata
      .where(eq(mealIngredients.id, mealIngredientId));

    const page = await getDayHistory("Asia/Kolkata");

    expect(page.entries).toHaveLength(1);
    expect(page.entries[0].date).toBe("2026-01-02");
  });

  it("paginates at HISTORY_PAGE_SIZE and reports a null nextOffset on the last page", async () => {
    const userId = await seedUser();
    const productId = await seedProduct(userId);
    mockAuth.mockResolvedValue({ user: { id: userId } });
    const ONE_DAY_MS = 24 * 60 * 60 * 1000;
    for (let daysAgo = 0; daysAgo < HISTORY_PAGE_SIZE + 1; daysAgo += 1) {
      const { mealId } = await createMeal();
      const { mealIngredientId } = await saveMealIngredient({
        mealId, productId, quantityG: 100, quantitySource: "manual",
      });
      await db
        .update(mealIngredients)
        .set({ createdAt: new Date(Date.now() - daysAgo * ONE_DAY_MS) })
        .where(eq(mealIngredients.id, mealIngredientId));
    }

    const firstPage = await getDayHistory("UTC");
    expect(firstPage.entries).toHaveLength(HISTORY_PAGE_SIZE);
    expect(firstPage.nextOffset).toBe(HISTORY_PAGE_SIZE);

    const secondPage = await getDayHistory("UTC", firstPage.nextOffset ?? 0);
    expect(secondPage.entries).toHaveLength(1);
    expect(secondPage.nextOffset).toBeNull();
  });
});
