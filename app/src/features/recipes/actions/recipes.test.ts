const mockAuth = vi.fn();
vi.mock("@/auth", () => ({ auth: () => mockAuth() }));

import { eq, sql } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { db } from "@/lib/db";
import { mealIngredients, meals, productOverrides, products, recipeItems, recipes, users } from "@/lib/db/schema";
import { todayLocalDateString } from "@/lib/date/day-bounds";
import { toSearchText } from "@/lib/db/search-text";
import { listRecipes, saveMealAsRecipe } from "./recipes";

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

const signedInAs = (userId: string) => mockAuth.mockResolvedValue({ user: { id: userId } });

const seedMeal = async (userId: string, logDate = TODAY): Promise<string> => {
  const [meal] = await db.insert(meals).values({ userId, logDate }).returning();
  return meal.id;
};

const addIngredient = async (
  mealId: string,
  productId: string,
  quantity: number,
  entry: { count: number | null; unit: string | null } = { count: null, unit: null },
): Promise<string> => {
  const [row] = await db
    .insert(mealIngredients)
    .values({
      mealId,
      productId,
      quantity: String(quantity),
      quantityUnit: "g",
      entryCount: entry.count === null ? null : String(entry.count),
      entryUnit: entry.unit,
      quantitySource: "manual",
    })
    .returning();
  return row.id;
};

beforeEach(async () => {
  mockAuth.mockReset();
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

describe("saveMealAsRecipe", () => {
  it("snapshots amounts and the entry echo, and stores no nutrition figures", async () => {
    const userId = await seedUser();
    signedInAs(userId);
    const bread = await seedProduct(userId, "Bread");
    const mealId = await seedMeal(userId);
    await addIngredient(mealId, bread, 32, { count: 1, unit: "slice" });

    const result = await saveMealAsRecipe(mealId, "Toast");
    expect(result.kind).toBe("saved");

    const items = await db.select().from(recipeItems);
    expect(items).toHaveLength(1);
    expect(Number(items[0].quantity)).toBe(32);
    expect(Number(items[0].entryCount)).toBe(1);
    expect(items[0].entryUnit).toBe("slice");
    // The row carries amounts only - no column here holds a kcal or a macro.
    expect(Object.keys(items[0])).not.toContain("energyKcal");
  });

  it("links the meal it was saved from", async () => {
    const userId = await seedUser();
    signedInAs(userId);
    const productId = await seedProduct(userId);
    const mealId = await seedMeal(userId);
    await addIngredient(mealId, productId, 200);

    const result = await saveMealAsRecipe(mealId, "Yogurt");
    if (result.kind !== "saved") throw new Error(`expected saved, got ${result.kind}`);

    const [meal] = await db.select().from(meals);
    expect(meal.recipeId).toBe(result.recipeId);
  });

  it("writes a romanized name_search so a Cyrillic name is reachable from a Latin keyboard", async () => {
    const userId = await seedUser();
    signedInAs(userId);
    const productId = await seedProduct(userId);
    const mealId = await seedMeal(userId);
    await addIngredient(mealId, productId, 200);

    await saveMealAsRecipe(mealId, "Сирење и леб");

    const [recipe] = await db.select().from(recipes);
    expect(recipe.nameSearch).toBe(toSearchText("Сирење и леб"));
  });

  it("refuses a whitespace-only name and writes nothing", async () => {
    const userId = await seedUser();
    signedInAs(userId);
    const productId = await seedProduct(userId);
    const mealId = await seedMeal(userId);
    await addIngredient(mealId, productId, 200);

    expect(await saveMealAsRecipe(mealId, "   ")).toEqual({ kind: "invalid_name" });
    expect(await db.select().from(recipes)).toHaveLength(0);
  });

  it("refuses a meal with no live ingredients", async () => {
    const userId = await seedUser();
    signedInAs(userId);
    const mealId = await seedMeal(userId);

    expect(await saveMealAsRecipe(mealId, "Nothing")).toEqual({ kind: "empty_meal" });
  });

  it("refuses another user's meal without naming it", async () => {
    const owner = await seedUser();
    const intruder = await seedUser();
    const productId = await seedProduct(owner);
    const mealId = await seedMeal(owner);
    await addIngredient(mealId, productId, 200);
    signedInAs(intruder);

    expect(await saveMealAsRecipe(mealId, "Theirs")).toEqual({ kind: "meal_missing" });
    expect(await db.select().from(recipes)).toHaveLength(0);
  });
});

describe("listRecipes", () => {
  it("prices a recipe from live product figures and counts its items", async () => {
    const userId = await seedUser();
    signedInAs(userId);
    const productId = await seedProduct(userId);
    const mealId = await seedMeal(userId);
    await addIngredient(mealId, productId, 200);
    await saveMealAsRecipe(mealId, "Yogurt");

    const [summary] = await listRecipes();
    expect(summary.name).toBe("Yogurt");
    expect(summary.itemCount).toBe(1);
    // 70 kcal / 100 g x 200 g
    expect(summary.total.energyKcal).toBeCloseTo(140);
    expect(summary.total.proteinG).toBeCloseTo(18);
  });

  it("moves with a corrected label figure, because nothing is stored", async () => {
    const userId = await seedUser();
    signedInAs(userId);
    const productId = await seedProduct(userId);
    const mealId = await seedMeal(userId);
    await addIngredient(mealId, productId, 200);
    await saveMealAsRecipe(mealId, "Yogurt");

    await db.update(products).set({ energyKcal: "140" }).where(eq(products.id, productId));

    const [summary] = await listRecipes();
    expect(summary.total.energyKcal).toBeCloseTo(280);
  });

  it("reads this user's own correction, not the canonical row", async () => {
    const userId = await seedUser();
    signedInAs(userId);
    const productId = await seedProduct(userId);
    const mealId = await seedMeal(userId);
    await addIngredient(mealId, productId, 200);
    await saveMealAsRecipe(mealId, "Yogurt");

    await db.insert(productOverrides).values({
      userId,
      productId,
      energyKcal: "35", fatG: "1.0", saturatesG: "0.6", carbohydrateG: "2.0",
      sugarsG: "2.0", proteinG: "4.5", saltG: "0.09",
    });

    const [summary] = await listRecipes();
    expect(summary.total.energyKcal).toBeCloseTo(70);
  });

  it("returns only the session user's rows", async () => {
    const mine = await seedUser();
    const theirs = await seedUser();
    for (const userId of [mine, theirs]) {
      const productId = await seedProduct(userId);
      const mealId = await seedMeal(userId);
      await addIngredient(mealId, productId, 200);
      signedInAs(userId);
      await saveMealAsRecipe(mealId, userId === mine ? "Mine" : "Theirs");
    }

    signedInAs(mine);
    expect((await listRecipes()).map((summary) => summary.name)).toEqual(["Mine"]);
  });

  it("orders by last use, newest first", async () => {
    const userId = await seedUser();
    signedInAs(userId);
    const productId = await seedProduct(userId);
    for (const name of ["Older", "Newer"]) {
      const mealId = await seedMeal(userId);
      await addIngredient(mealId, productId, 200);
      await saveMealAsRecipe(mealId, name);
    }
    await db.update(recipes).set({ lastUsedAt: new Date(0) }).where(eq(recipes.name, "Older"));

    expect((await listRecipes()).map((summary) => summary.name)).toEqual(["Newer", "Older"]);
  });

  it("lists two recipes with the same name as two rows", async () => {
    const userId = await seedUser();
    signedInAs(userId);
    const productId = await seedProduct(userId);
    for (const quantity of [100, 200]) {
      const mealId = await seedMeal(userId);
      await addIngredient(mealId, productId, quantity);
      await saveMealAsRecipe(mealId, "Oats");
    }

    const summaries = await listRecipes();
    expect(summaries).toHaveLength(2);
    // Same name, told apart by their figures - the stated ceiling.
    expect(new Set(summaries.map((summary) => summary.total.energyKcal)).size).toBe(2);
  });
});
