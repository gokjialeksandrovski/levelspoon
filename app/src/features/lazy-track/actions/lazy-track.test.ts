const mockAuth = vi.fn();
vi.mock("@/auth", () => ({ auth: () => mockAuth() }));

import { eq, sql } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { db } from "@/lib/db";
import { mealIngredients, meals, products, recipeItems, recipes, users } from "@/lib/db/schema";
import { todayLocalDateString } from "@/lib/date/day-bounds";

import { estimateMeal, logLazyMeal } from "./lazy-track";
import type { LoggedItem } from "./lazy-track.utils";

vi.stubEnv("MEAL_ESTIMATE_PROVIDER", "mock");

const item = (patch: Partial<LoggedItem> = {}): LoggedItem => ({
  name: "Chicken breast",
  grams: 150,
  per100g: { energyKcal: 165, fatG: 3.6, saturatesG: 1, carbohydrateG: 0, sugarsG: 0, proteinG: 31, saltG: 0.2, fibreG: 0 },
  gramsEdited: false,
  ...patch,
});

const seedUser = async (): Promise<string> => {
  const [user] = await db.insert(users).values({ email: `lt-${crypto.randomUUID()}@example.com` }).returning();
  return user.id;
};

const seedMeal = async (userId: string): Promise<string> => {
  const [meal] = await db.insert(meals).values({ userId, logDate: todayLocalDateString("UTC") }).returning();
  return meal.id;
};

const signedInAs = (userId: string) => mockAuth.mockResolvedValue({ user: { id: userId } });

beforeEach(async () => {
  mockAuth.mockReset();
  await db.execute(sql`TRUNCATE TABLE recipe_items, recipes, meal_ingredients, meals, products, "user" CASCADE`);
});

describe("estimateMeal", () => {
  it("returns the mock estimate, bounded", async () => {
    signedInAs(await seedUser());
    const result = await estimateMeal("chicken rice bowl", null);
    expect(result.kind).toBe("estimated");
    if (result.kind === "estimated") expect(result.estimate.items).toHaveLength(3);
  });

  it("refuses empty input without a request", async () => {
    signedInAs(await seedUser());
    expect(await estimateMeal("   ", null)).toEqual({ kind: "nothing_found" });
  });

  it("reports an unreadable photo format", async () => {
    signedInAs(await seedUser());
    vi.stubEnv("MEAL_ESTIMATE_PROVIDER", "gemini");
    vi.stubEnv("GEMINI_API_KEY", "test-key");
    const heic = new Blob([Buffer.from("....ftypheic", "ascii")]);
    expect(await estimateMeal("pasta", heic)).toEqual({ kind: "photo_unreadable" });
    vi.stubEnv("MEAL_ESTIMATE_PROVIDER", "mock");
  });
});

describe("logLazyMeal", () => {
  it("writes private AI rows and ingredients in one go", async () => {
    const userId = await seedUser();
    const mealId = await seedMeal(userId);
    signedInAs(userId);

    const result = await logLazyMeal(mealId, [item(), item({ name: "Rice", grams: 180, gramsEdited: true })], null);

    expect(result).toEqual({ kind: "logged" });
    const rows = await db
      .select({ origin: products.nutritionOrigin, photo: products.nutritionPhotoKey, source: mealIngredients.quantitySource, quantity: mealIngredients.quantity })
      .from(mealIngredients)
      .innerJoin(products, eq(products.id, mealIngredients.productId))
      .where(eq(mealIngredients.mealId, mealId))
      .orderBy(mealIngredients.createdAt);
    expect(rows).toEqual([
      { origin: "ai_estimate", photo: null, source: "ai_estimated", quantity: "150.00" },
      { origin: "ai_estimate", photo: null, source: "manual", quantity: "180.00" },
    ]);
  });

  it("saves and links a recipe when named", async () => {
    const userId = await seedUser();
    const mealId = await seedMeal(userId);
    signedInAs(userId);

    await logLazyMeal(mealId, [item()], " Bowl ");

    const [recipe] = await db.select().from(recipes);
    expect(recipe.name).toBe("Bowl");
    expect(await db.select().from(recipeItems)).toHaveLength(1);
    const [meal] = await db.select({ recipeId: meals.recipeId }).from(meals).where(eq(meals.id, mealId));
    expect(meal.recipeId).toBe(recipe.id);
  });

  it("refuses tampered figures and writes nothing", async () => {
    const userId = await seedUser();
    const mealId = await seedMeal(userId);
    signedInAs(userId);

    expect(await logLazyMeal(mealId, [item(), item({ grams: 1e9 })], null)).toEqual({ kind: "invalid_items" });
    expect(await logLazyMeal(mealId, [item({ per100g: { ...item().per100g, proteinG: -1 } })], null)).toEqual({ kind: "invalid_items" });
    expect(await logLazyMeal(mealId, [], null)).toEqual({ kind: "invalid_items" });
    expect(await db.select().from(products)).toEqual([]);
  });

  it("refuses a blank recipe name and writes nothing", async () => {
    const userId = await seedUser();
    const mealId = await seedMeal(userId);
    signedInAs(userId);
    expect(await logLazyMeal(mealId, [item()], "  ")).toEqual({ kind: "invalid_recipe_name" });
    expect(await db.select().from(products)).toEqual([]);
  });

  it("refuses another user's meal and writes nothing", async () => {
    const owner = await seedUser();
    const mealId = await seedMeal(owner);
    signedInAs(await seedUser());
    expect(await logLazyMeal(mealId, [item()], null)).toEqual({ kind: "meal_missing" });
    expect(await db.select().from(products)).toEqual([]);
  });
});
