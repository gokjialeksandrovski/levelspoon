const mockAuth = vi.fn();
vi.mock("@/auth", () => ({ auth: () => mockAuth() }));

import { and, eq, isNull, sql } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { db } from "@/lib/db";
import { mealIngredients, meals, products, recipeItems, recipes, users } from "@/lib/db/schema";
import { todayLocalDateString } from "@/lib/date/day-bounds";
import { MOCK_UNAVAILABLE_MARKER } from "@/lib/meal-estimate/mock-provider";
import { getMealDetail } from "@/features/meals/actions/meals";
import { listRecipes, saveMealAsRecipe } from "@/features/recipes/actions/recipes";

import { estimateMeal, undoMealEstimate } from "./lazy-track";

vi.stubEnv("MEAL_ESTIMATE_PROVIDER", "mock");

const BOWL = "chicken rice bowl";

const seedUser = async (): Promise<string> => {
  const [user] = await db.insert(users).values({ email: `lt-${crypto.randomUUID()}@example.com` }).returning();
  return user.id;
};

const seedMeal = async (userId: string): Promise<string> => {
  const [meal] = await db.insert(meals).values({ userId, logDate: todayLocalDateString("UTC") }).returning();
  return meal.id;
};

const signedInAs = (userId: string) => mockAuth.mockResolvedValue({ user: { id: userId } });

const signedInWithMeal = async (): Promise<{ userId: string; mealId: string }> => {
  const userId = await seedUser();
  signedInAs(userId);
  return { userId, mealId: await seedMeal(userId) };
};

const seedRealProduct = async (userId: string): Promise<string> => {
  const [real] = await db
    .insert(products)
    .values({ name: "Real chicken", nameSearch: "real chicken", energyKcal: "165", fatG: "3.6", saturatesG: "1", carbohydrateG: "0", sugarsG: "0", proteinG: "31", saltG: "0.2", nutritionPhotoKey: `test/${crypto.randomUUID()}.jpg`, createdByUserId: userId })
    .returning({ id: products.id });
  return real.id;
};

const seedRealIngredient = async (userId: string, mealId: string): Promise<void> => {
  await db.insert(mealIngredients).values({ mealId, productId: await seedRealProduct(userId), quantity: "100", quantityUnit: "g", quantitySource: "manual" });
};

const liveIngredients = (mealId: string) =>
  db
    .select({ name: products.name, origin: products.nutritionOrigin, photo: products.nutritionPhotoKey, source: mealIngredients.quantitySource, quantity: mealIngredients.quantity })
    .from(mealIngredients)
    .innerJoin(products, eq(products.id, mealIngredients.productId))
    .where(and(eq(mealIngredients.mealId, mealId), isNull(mealIngredients.deletedAt)))
    .orderBy(mealIngredients.createdAt);

const liveNames = async (mealId: string): Promise<string[]> => (await liveIngredients(mealId)).map((row) => row.name);

beforeEach(async () => {
  mockAuth.mockReset();
  await db.execute(sql`TRUNCATE TABLE recipe_items, recipes, meal_ingredients, meals, products, "user" CASCADE`);
});

describe("estimateMeal", () => {
  it("logs the estimate as private AI rows with Gemini's grams", async () => {
    const { mealId } = await signedInWithMeal();

    expect(await estimateMeal(mealId, BOWL, null, false)).toEqual({ kind: "logged" });

    expect(await liveIngredients(mealId)).toEqual([
      { name: "Chicken breast", origin: "ai_estimate", photo: null, source: "ai_estimated", quantity: "150.00" },
      { name: "White rice, cooked", origin: "ai_estimate", photo: null, source: "ai_estimated", quantity: "200.00" },
      { name: "Olive oil", origin: "ai_estimate", photo: null, source: "ai_estimated", quantity: "10.00" },
    ]);
  });

  it("refuses empty input and writes nothing", async () => {
    const { mealId } = await signedInWithMeal();
    expect(await estimateMeal(mealId, "   ", null, false)).toEqual({ kind: "nothing_found" });
    expect(await db.select().from(products)).toEqual([]);
  });

  it("reports unavailable when the provider throws, and writes nothing", async () => {
    const { mealId } = await signedInWithMeal();
    expect(await estimateMeal(mealId, `chicken with rice ${MOCK_UNAVAILABLE_MARKER}`, null, false)).toEqual({ kind: "unavailable" });
    expect(await db.select().from(products)).toEqual([]);
  });

  it("reports an unreadable photo format", async () => {
    const { mealId } = await signedInWithMeal();
    vi.stubEnv("MEAL_ESTIMATE_PROVIDER", "gemini");
    vi.stubEnv("GEMINI_API_KEY", "test-key");
    const heic = new Blob([Buffer.from("....ftypheic", "ascii")]);
    expect(await estimateMeal(mealId, "pasta", heic, false)).toEqual({ kind: "photo_unreadable" });
    vi.stubEnv("MEAL_ESTIMATE_PROVIDER", "mock");
  });

  it("refuses another user's meal and writes nothing", async () => {
    const mealId = await seedMeal(await seedUser());
    signedInAs(await seedUser());
    expect(await estimateMeal(mealId, BOWL, null, false)).toEqual({ kind: "meal_missing" });
    expect(await db.select().from(products)).toEqual([]);
  });

  it("adds a second estimate beside the first when not replacing", async () => {
    const { mealId } = await signedInWithMeal();
    await estimateMeal(mealId, BOWL, null, false);
    await estimateMeal(mealId, BOWL, null, false);
    expect(await liveIngredients(mealId)).toHaveLength(6);
  });

  it("replaces only the untouched guesses when replacing", async () => {
    const { userId, mealId } = await signedInWithMeal();
    await seedRealIngredient(userId, mealId);
    await estimateMeal(mealId, BOWL, null, false);

    await estimateMeal(mealId, `${BOWL}, more rice`, null, true);

    expect(await liveNames(mealId)).toEqual(["Real chicken", "Chicken breast", "White rice, cooked", "Olive oil"]);
  });

  it("keeps the old guess when the re-estimate fails", async () => {
    const { mealId } = await signedInWithMeal();
    await estimateMeal(mealId, BOWL, null, false);
    await estimateMeal(mealId, `chicken ${MOCK_UNAVAILABLE_MARKER}`, null, true);
    expect(await liveIngredients(mealId)).toHaveLength(3);
  });
});

describe("undoMealEstimate", () => {
  it("removes untouched guesses, keeps edited guesses and real food", async () => {
    const { userId, mealId } = await signedInWithMeal();
    await seedRealIngredient(userId, mealId);
    await estimateMeal(mealId, BOWL, null, false);
    const [, firstGuess] = await db.select({ id: mealIngredients.id }).from(mealIngredients).where(eq(mealIngredients.mealId, mealId)).orderBy(mealIngredients.createdAt);
    await db.update(mealIngredients).set({ quantitySource: "manual" }).where(eq(mealIngredients.id, firstGuess.id));

    expect(await undoMealEstimate(mealId)).toEqual({ kind: "undone" });

    expect(await liveNames(mealId)).toEqual(["Real chicken", "Chicken breast"]);
  });

  it("refuses another user's meal and removes nothing", async () => {
    const { mealId } = await signedInWithMeal();
    await estimateMeal(mealId, BOWL, null, false);
    signedInAs(await seedUser());
    expect(await undoMealEstimate(mealId)).toEqual({ kind: "meal_missing" });
    expect(await liveIngredients(mealId)).toHaveLength(3);
  });
});

const logBowlAsRecipe = async (mealId: string): Promise<void> => {
  await estimateMeal(mealId, BOWL, null, false);
  await saveMealAsRecipe(mealId, "Bowl");
};

describe("derived AI tags", () => {
  it("flags AI ingredients and the recipe filed from them", async () => {
    const { mealId } = await signedInWithMeal();
    await logBowlAsRecipe(mealId);

    const detail = await getMealDetail(mealId);
    expect(detail?.ingredients.map((ingredient) => ingredient.isAiEstimate)).toEqual([true, true, true]);
    expect(detail?.recipe?.isAiEstimate).toBe(true);
    expect((await listRecipes()).map((recipe) => recipe.isAiEstimate)).toEqual([true]);
  });

  it("clears the recipe tag once no item is an AI estimate", async () => {
    const { userId, mealId } = await signedInWithMeal();
    await logBowlAsRecipe(mealId);
    await db.update(recipeItems).set({ productId: await seedRealProduct(userId) });

    expect((await listRecipes()).map((recipe) => recipe.isAiEstimate)).toEqual([false]);
  });

  // A recipe mixing both needs "any" (OR) in fetchRecipeSummaries: an `every`
  // (AND) regression would still pass the two tests above.
  it("stays true for a recipe holding AI items and one real item", async () => {
    const { userId, mealId } = await signedInWithMeal();
    await logBowlAsRecipe(mealId);
    const [recipe] = await db.select().from(recipes);
    await db.insert(recipeItems).values({ recipeId: recipe.id, productId: await seedRealProduct(userId), quantity: "100", position: 3 });

    expect((await listRecipes()).map((recipe) => recipe.isAiEstimate)).toEqual([true]);
  });
});
