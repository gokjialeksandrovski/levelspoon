import { eq, sql } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockAuth = vi.fn();
vi.mock("@/auth", () => ({ auth: () => mockAuth() }));

import { db } from "@/lib/db";
import { mealIngredients, meals, products, users } from "@/lib/db/schema";

import { computeContribution } from "./meals.utils";
import { createMeal, getMeal, getTodayTotal, saveMealIngredient } from "./meals";
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

describe("getMeal", () => {
  it("returns the meal when the authenticated user owns it", async () => {
    const userId = await seedUser();
    mockAuth.mockResolvedValue({ user: { id: userId } });
    const { mealId } = await createMeal({ name: "Breakfast" });

    const meal = await getMeal(mealId);

    expect(meal).toEqual({ id: mealId, name: "Breakfast" });
  });

  it("returns null when a different user owns the meal", async () => {
    const ownerId = await seedUser();
    const intruderId = await seedUser();
    mockAuth.mockResolvedValue({ user: { id: ownerId } });
    const { mealId } = await createMeal({ name: "Breakfast" });

    mockAuth.mockResolvedValue({ user: { id: intruderId } });
    const meal = await getMeal(mealId);

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

describe("getTodayTotal", () => {
  it("sums today's ingredients for the authenticated user only", async () => {
    const userId = await seedUser();
    const otherUserId = await seedUser();
    const productId = await seedProduct(userId);
    mockAuth.mockResolvedValue({ user: { id: userId } });
    const { mealId } = await createMeal({ name: "Breakfast" });
    await saveMealIngredient({ mealId, productId, quantityG: 200, quantitySource: "manual" });

    const otherProductId = await seedProduct(otherUserId);
    mockAuth.mockResolvedValue({ user: { id: otherUserId } });
    const { mealId: otherMealId } = await createMeal({ name: "Other" });
    await saveMealIngredient({ mealId: otherMealId, productId: otherProductId, quantityG: 999, quantitySource: "manual" });

    mockAuth.mockResolvedValue({ user: { id: userId } });
    const total = await getTodayTotal();

    // 200g of a 70kcal/100g product = 140kcal
    expect(total.energyKcal).toBeCloseTo(140, 5);
  });

  it("excludes ingredients logged before today", async () => {
    const userId = await seedUser();
    const productId = await seedProduct(userId);
    mockAuth.mockResolvedValue({ user: { id: userId } });
    const { mealId } = await createMeal({ name: "Yesterday's meal" });
    const { mealIngredientId } = await saveMealIngredient({
      mealId,
      productId,
      quantityG: 200,
      quantitySource: "manual",
    });
    const ONE_DAY_MS = 24 * 60 * 60 * 1000;
    await db
      .update(mealIngredients)
      .set({ createdAt: new Date(Date.now() - ONE_DAY_MS) })
      .where(eq(mealIngredients.id, mealIngredientId));

    const total = await getTodayTotal();

    expect(total.energyKcal).toBe(0);
  });
});
