import { eq, sql } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockAuth = vi.fn();
vi.mock("@/auth", () => ({ auth: () => mockAuth() }));

import { db } from "@/lib/db";
import { mealIngredients, meals, products, users } from "@/lib/db/schema";
import { todayLocalDateString } from "@/lib/date/day-bounds";

import { computeContribution } from "./meals.utils";
import { createMeal, getDayLog, getMealDetail, saveMealIngredient, removeMealIngredient, updateMealIngredientQuantity } from "./meals";
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

    const { mealId } = await createMeal({ name: "Breakfast" });

    const [row] = await db.select().from(meals).where(eq(meals.id, mealId));
    expect(row.name).toBe("Breakfast");
    expect(row.userId).toBe(userId);
  });
});

describe("getMealDetail", () => {
  it("returns the meal with its ingredients and total when the authenticated user owns it", async () => {
    const userId = await seedUser();
    const productId = await seedProduct(userId);
    mockAuth.mockResolvedValue({ user: { id: userId } });
    const { mealId } = await createMeal({ name: "Breakfast" });
    await saveMealIngredient({ mealId, productId, quantityG: 200, quantitySource: "manual" });

    const meal = await getMealDetail(mealId);

    expect(meal?.name).toBe("Breakfast");
    expect(meal?.ingredients).toHaveLength(1);
    expect(meal?.ingredients[0].productName).toBe("Test Product");
    expect(meal?.ingredients[0].quantityG).toBe(200);
    expect(meal?.total.energyKcal).toBeCloseTo(140, 5);
  });

  it("returns an empty ingredient list and zero total for a meal with no ingredients yet", async () => {
    const userId = await seedUser();
    mockAuth.mockResolvedValue({ user: { id: userId } });
    const { mealId } = await createMeal({ name: "Breakfast" });

    const meal = await getMealDetail(mealId);

    expect(meal?.ingredients).toEqual([]);
    expect(meal?.total.energyKcal).toBe(0);
  });

  it("returns null when a different user owns the meal", async () => {
    const ownerId = await seedUser();
    const intruderId = await seedUser();
    mockAuth.mockResolvedValue({ user: { id: ownerId } });
    const { mealId } = await createMeal({ name: "Breakfast" });

    mockAuth.mockResolvedValue({ user: { id: intruderId } });
    const meal = await getMealDetail(mealId);

    expect(meal).toBeNull();
  });
});

describe("saveMealIngredient", () => {
  it("writes a meal_ingredients row for the meal's owner", async () => {
    const userId = await seedUser();
    const productId = await seedProduct(userId);
    mockAuth.mockResolvedValue({ user: { id: userId } });
    const { mealId } = await createMeal({ name: "Breakfast" });

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
    const { mealId } = await createMeal({ name: "Breakfast" });

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
    const { mealId } = await createMeal({ name: "Breakfast" });
    await saveMealIngredient({ mealId, productId, quantityG: 200, quantitySource: "manual" });

    const log = await getDayLog(todayLocalDateString("UTC"), "UTC");

    expect(log.dayTotal.energyKcal).toBeCloseTo(140, 5);
    expect(log.meals).toEqual([{ id: mealId, name: "Breakfast", total: log.dayTotal }]);
  });

  it("excludes meals from a different local day", async () => {
    const userId = await seedUser();
    const productId = await seedProduct(userId);
    mockAuth.mockResolvedValue({ user: { id: userId } });
    const { mealId } = await createMeal({ name: "Yesterday" });
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
    const { mealId } = await createMeal({ name: "Late snack" });
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
});

describe("removeMealIngredient", () => {
  it("deletes the ingredient when the authenticated user owns the meal", async () => {
    const userId = await seedUser();
    const productId = await seedProduct(userId);
    mockAuth.mockResolvedValue({ user: { id: userId } });
    const { mealId } = await createMeal({ name: "Breakfast" });
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
    const { mealId } = await createMeal({ name: "Breakfast" });
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
    const { mealId } = await createMeal({ name: "Breakfast" });
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
    const { mealId } = await createMeal({ name: "Breakfast" });
    const { mealIngredientId } = await saveMealIngredient({
      mealId, productId, quantityG: 200, quantitySource: "manual",
    });

    mockAuth.mockResolvedValue({ user: { id: intruderId } });
    await expect(updateMealIngredientQuantity(mealIngredientId, 100)).rejects.toThrow(NotAuthorizedError);
  });
});
