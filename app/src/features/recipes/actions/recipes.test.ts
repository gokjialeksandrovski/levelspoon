const mockAuth = vi.fn();
vi.mock("@/auth", () => ({ auth: () => mockAuth() }));

import { and, eq, isNull, sql } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { db } from "@/lib/db";
import { mealIngredients, meals, productOverrides, products, recipeItems, recipes, users } from "@/lib/db/schema";
import { addCalendarDays, todayLocalDateString } from "@/lib/date/day-bounds";
import { toSearchText } from "@/lib/db/search-text";
import {
  deleteRecipe,
  earlierMealsFromRecipe,
  enterRecipe,
  listRecipes,
  renameRecipe,
  saveMealAsRecipe,
  saveRecipeEdit,
} from "./recipes";
import type { AmountRow } from "./recipes.store";

const TODAY = todayLocalDateString("UTC");
const YESTERDAY = addCalendarDays(TODAY, -1);

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

const savedRecipeFrom = async (userId: string, name: string, amounts: [string, number][]): Promise<string> => {
  const mealId = await seedMeal(userId);
  for (const [productId, quantity] of amounts) {
    await addIngredient(mealId, productId, quantity);
  }
  const result = await saveMealAsRecipe(mealId, name);
  if (result.kind !== "saved") throw new Error(`seed failed: ${result.kind}`);
  return result.recipeId;
};

describe("enterRecipe", () => {
  it("appends to a meal that already has rows, keeping what was there", async () => {
    const userId = await seedUser();
    signedInAs(userId);
    const productId = await seedProduct(userId);
    const recipeId = await savedRecipeFrom(userId, "Yogurt", [[productId, 200]]);

    const target = await seedMeal(userId);
    await addIngredient(target, productId, 50);
    const result = await enterRecipe(target, recipeId);

    expect(result).toEqual({ kind: "entered", addedCount: 1 });
    const rows = await db.select().from(mealIngredients).where(eq(mealIngredients.mealId, target));
    expect(rows.map((row) => Number(row.quantity)).sort((a, b) => a - b)).toEqual([50, 200]);
  });

  it("writes quantity_source manual and re-reads quantity_unit from the product", async () => {
    const userId = await seedUser();
    signedInAs(userId);
    const productId = await seedProduct(userId);
    await db.update(products).set({ nutritionBasisUnit: "ml" }).where(eq(products.id, productId));
    const recipeId = await savedRecipeFrom(userId, "Milk", [[productId, 250]]);
    // The stored item still says "g" - the entry must not trust it.
    await db.update(recipeItems).set({ quantityUnit: "g" }).where(eq(recipeItems.recipeId, recipeId));

    const target = await seedMeal(userId);
    await enterRecipe(target, recipeId);

    const [row] = await db.select().from(mealIngredients).where(eq(mealIngredients.mealId, target));
    expect(row.quantitySource).toBe("manual");
    expect(row.quantityUnit).toBe("ml");
  });

  it("carries the entry echo so \"1 slice\" is still \"1 slice\"", async () => {
    const userId = await seedUser();
    signedInAs(userId);
    const bread = await seedProduct(userId, "Bread");
    const source = await seedMeal(userId);
    await addIngredient(source, bread, 32, { count: 1, unit: "slice" });
    const saved = await saveMealAsRecipe(source, "Toast");
    if (saved.kind !== "saved") throw new Error(saved.kind);

    const target = await seedMeal(userId);
    await enterRecipe(target, saved.recipeId);

    const [row] = await db.select().from(mealIngredients).where(eq(mealIngredients.mealId, target));
    expect(Number(row.entryCount)).toBe(1);
    expect(row.entryUnit).toBe("slice");
  });

  it("links the meal and bumps last_used_at", async () => {
    const userId = await seedUser();
    signedInAs(userId);
    const productId = await seedProduct(userId);
    const recipeId = await savedRecipeFrom(userId, "Yogurt", [[productId, 200]]);
    await db.update(recipes).set({ lastUsedAt: new Date(0) }).where(eq(recipes.id, recipeId));

    const target = await seedMeal(userId);
    await enterRecipe(target, recipeId);

    const [meal] = await db.select().from(meals).where(eq(meals.id, target));
    const [recipe] = await db.select().from(recipes).where(eq(recipes.id, recipeId));
    expect(meal.recipeId).toBe(recipeId);
    expect(recipe.lastUsedAt.getTime()).toBeGreaterThan(0);
  });

  it("relinks the meal when a second recipe is entered - latest wins", async () => {
    const userId = await seedUser();
    signedInAs(userId);
    const productId = await seedProduct(userId);
    const first = await savedRecipeFrom(userId, "First", [[productId, 100]]);
    const second = await savedRecipeFrom(userId, "Second", [[productId, 200]]);

    const target = await seedMeal(userId);
    await enterRecipe(target, first);
    await enterRecipe(target, second);

    const [meal] = await db.select().from(meals).where(eq(meals.id, target));
    expect(meal.recipeId).toBe(second);
    // The first recipe's rows stay in the meal - an overwrite later files the
    // whole meal, that recipe's rows included.
    const rows = await db.select().from(mealIngredients).where(eq(mealIngredients.mealId, target));
    expect(rows).toHaveLength(2);
  });

  // [RF-4a] A meal reached through History is on a past day. Entering a
  // recipe into it must write to that meal and leave today alone.
  it("enters into a past day's meal without touching today", async () => {
    const userId = await seedUser();
    signedInAs(userId);
    const productId = await seedProduct(userId);
    const recipeId = await savedRecipeFrom(userId, "Yogurt", [[productId, 200]]);
    const yesterdayMeal = await seedMeal(userId, YESTERDAY);
    const todayMeal = await seedMeal(userId, TODAY);

    await enterRecipe(yesterdayMeal, recipeId);

    const yesterdayRows = await db.select().from(mealIngredients).where(eq(mealIngredients.mealId, yesterdayMeal));
    const todayRows = await db.select().from(mealIngredients).where(eq(mealIngredients.mealId, todayMeal));
    expect(yesterdayRows).toHaveLength(1);
    expect(todayRows).toHaveLength(0);
  });

  // [RF-5] The picker's list was fetched once on mount. A recipe deleted in
  // another tab since then must leave the meal exactly as it was.
  it("refuses a deleted recipe and writes nothing", async () => {
    const userId = await seedUser();
    signedInAs(userId);
    const productId = await seedProduct(userId);
    const recipeId = await savedRecipeFrom(userId, "Yogurt", [[productId, 200]]);
    await deleteRecipe(recipeId);

    const target = await seedMeal(userId);
    await addIngredient(target, productId, 50);
    expect(await enterRecipe(target, recipeId)).toEqual({ kind: "recipe_missing" });

    const rows = await db.select().from(mealIngredients).where(eq(mealIngredients.mealId, target));
    expect(rows).toHaveLength(1);
    const [meal] = await db.select().from(meals).where(eq(meals.id, target));
    expect(meal.recipeId).toBeNull();
  });

  it("refuses another user's recipe", async () => {
    const owner = await seedUser();
    const intruder = await seedUser();
    signedInAs(owner);
    const productId = await seedProduct(owner);
    const recipeId = await savedRecipeFrom(owner, "Theirs", [[productId, 200]]);

    signedInAs(intruder);
    const target = await seedMeal(intruder);
    expect(await enterRecipe(target, recipeId)).toEqual({ kind: "recipe_missing" });
  });
});

describe("renameRecipe", () => {
  it("rewrites name and name_search together", async () => {
    const userId = await seedUser();
    signedInAs(userId);
    const productId = await seedProduct(userId);
    const recipeId = await savedRecipeFrom(userId, "Oats", [[productId, 50]]);

    expect(await renameRecipe(recipeId, "Овесна каша")).toEqual({ kind: "renamed", name: "Овесна каша" });

    const [recipe] = await db.select().from(recipes).where(eq(recipes.id, recipeId));
    expect(recipe.name).toBe("Овесна каша");
    expect(recipe.nameSearch).toBe(toSearchText("Овесна каша"));
  });

  it("refuses a blank name and changes nothing", async () => {
    const userId = await seedUser();
    signedInAs(userId);
    const productId = await seedProduct(userId);
    const recipeId = await savedRecipeFrom(userId, "Oats", [[productId, 50]]);

    expect(await renameRecipe(recipeId, "  ")).toEqual({ kind: "invalid_name" });
    const [recipe] = await db.select().from(recipes).where(eq(recipes.id, recipeId));
    expect(recipe.name).toBe("Oats");
  });

  it("refuses another user's recipe", async () => {
    const owner = await seedUser();
    const intruder = await seedUser();
    signedInAs(owner);
    const productId = await seedProduct(owner);
    const recipeId = await savedRecipeFrom(owner, "Theirs", [[productId, 50]]);

    signedInAs(intruder);
    expect(await renameRecipe(recipeId, "Mine now")).toEqual({ kind: "recipe_missing" });
  });
});

describe("deleteRecipe", () => {
  it("nulls the link on every meal and leaves every ingredient in place", async () => {
    const userId = await seedUser();
    signedInAs(userId);
    const productId = await seedProduct(userId);
    const recipeId = await savedRecipeFrom(userId, "Yogurt", [[productId, 200]]);
    const second = await seedMeal(userId);
    await enterRecipe(second, recipeId);

    expect(await deleteRecipe(recipeId)).toEqual({ kind: "deleted" });

    const linked = await db.select().from(meals).where(eq(meals.recipeId, recipeId));
    expect(linked).toHaveLength(0);
    expect(await db.select().from(mealIngredients)).toHaveLength(2);
  });

  it("soft-deletes, so the row survives and listRecipes drops it", async () => {
    const userId = await seedUser();
    signedInAs(userId);
    const productId = await seedProduct(userId);
    const recipeId = await savedRecipeFrom(userId, "Yogurt", [[productId, 200]]);

    await deleteRecipe(recipeId);

    const [recipe] = await db.select().from(recipes).where(eq(recipes.id, recipeId));
    expect(recipe.deletedAt).not.toBeNull();
    expect(await listRecipes()).toHaveLength(0);
  });

  it("refuses another user's recipe", async () => {
    const owner = await seedUser();
    const intruder = await seedUser();
    signedInAs(owner);
    const productId = await seedProduct(owner);
    const recipeId = await savedRecipeFrom(owner, "Theirs", [[productId, 50]]);

    signedInAs(intruder);
    expect(await deleteRecipe(recipeId)).toEqual({ kind: "recipe_missing" });
    const [recipe] = await db.select().from(recipes).where(eq(recipes.id, recipeId));
    expect(recipe.deletedAt).toBeNull();
  });
});

const draftItem = (productId: string, quantity: number): AmountRow => ({
  productId,
  quantity,
  quantityUnit: "g",
  entryCount: quantity,
  entryUnit: "g",
});

const liveRows = (mealId: string) =>
  db.select().from(mealIngredients).where(and(eq(mealIngredients.mealId, mealId), isNull(mealIngredients.deletedAt)));

describe("earlierMealsFromRecipe", () => {
  it("offers an earlier meal that still matches and names one that does not", async () => {
    const userId = await seedUser();
    signedInAs(userId);
    const productId = await seedProduct(userId);
    const recipeId = await savedRecipeFrom(userId, "Yogurt", [[productId, 200]]);

    const untouched = await seedMeal(userId);
    await enterRecipe(untouched, recipeId);
    const edited = await seedMeal(userId);
    await enterRecipe(edited, recipeId);
    await db
      .update(mealIngredients)
      .set({ quantity: "250.00" })
      .where(eq(mealIngredients.mealId, edited));
    const open = await seedMeal(userId);
    await enterRecipe(open, recipeId);

    const earlier = await earlierMealsFromRecipe(open);
    expect(earlier.map((meal) => meal.mealId).sort()).toEqual([edited, untouched].sort());
    expect(earlier.find((meal) => meal.mealId === untouched)?.matches).toBe(true);
    expect(earlier.find((meal) => meal.mealId === edited)?.matches).toBe(false);
  });

  it("states each meal's current kcal, so the prompt's delta is measured", async () => {
    const userId = await seedUser();
    signedInAs(userId);
    const productId = await seedProduct(userId);
    const recipeId = await savedRecipeFrom(userId, "Yogurt", [[productId, 200]]);
    const untouched = await seedMeal(userId);
    await enterRecipe(untouched, recipeId);
    const open = await seedMeal(userId);
    await enterRecipe(open, recipeId);

    const [earlier] = await earlierMealsFromRecipe(open);
    expect(earlier.currentKcal).toBeCloseTo(140);
  });

  it("numbers meals by their position in the day", async () => {
    const userId = await seedUser();
    signedInAs(userId);
    const productId = await seedProduct(userId);
    const recipeId = await savedRecipeFrom(userId, "Yogurt", [[productId, 200]]);
    const first = await seedMeal(userId);
    await enterRecipe(first, recipeId);
    const open = await seedMeal(userId);
    await enterRecipe(open, recipeId);

    const [earlier] = await earlierMealsFromRecipe(open);
    // savedRecipeFrom created meal 1, so the first entered meal is meal 2.
    expect(earlier.mealNumber).toBe(2);
  });

  // [RF-4b] A closed day's total is a figure the user already read.
  it("never offers a meal from another day, matching or not", async () => {
    const userId = await seedUser();
    signedInAs(userId);
    const productId = await seedProduct(userId);
    const recipeId = await savedRecipeFrom(userId, "Yogurt", [[productId, 200]]);
    const yesterdayMeal = await seedMeal(userId, YESTERDAY);
    await enterRecipe(yesterdayMeal, recipeId);
    const open = await seedMeal(userId);
    await enterRecipe(open, recipeId);

    expect(await earlierMealsFromRecipe(open)).toHaveLength(0);
  });

  it("returns nothing for an unlinked meal", async () => {
    const userId = await seedUser();
    signedInAs(userId);
    const productId = await seedProduct(userId);
    const mealId = await seedMeal(userId);
    await addIngredient(mealId, productId, 200);

    expect(await earlierMealsFromRecipe(mealId)).toHaveLength(0);
  });
});

describe("saveRecipeEdit", () => {
  const linkedMeal = async (userId: string, productId: string) => {
    const recipeId = await savedRecipeFrom(userId, "Yogurt", [[productId, 200]]);
    const open = await seedMeal(userId);
    await enterRecipe(open, recipeId);
    return { recipeId, open };
  };

  it("overwrite rewrites the recipe and the open meal from the draft", async () => {
    const userId = await seedUser();
    signedInAs(userId);
    const productId = await seedProduct(userId);
    const { recipeId, open } = await linkedMeal(userId, productId);

    const result = await saveRecipeEdit(open, [draftItem(productId, 250)], { kind: "overwrite", alsoUpdateMealIds: [] });
    expect(result.kind).toBe("saved");

    const items = await db.select().from(recipeItems).where(eq(recipeItems.recipeId, recipeId));
    expect(items.map((item) => Number(item.quantity))).toEqual([250]);
    const rows = await liveRows(open);
    expect(rows.map((row) => Number(row.quantity))).toEqual([250]);
  });

  it("overwrite updates a ticked earlier meal from today", async () => {
    const userId = await seedUser();
    signedInAs(userId);
    const productId = await seedProduct(userId);
    const { recipeId, open } = await linkedMeal(userId, productId);
    const earlier = await seedMeal(userId);
    await enterRecipe(earlier, recipeId);
    const openAgain = await seedMeal(userId);
    await enterRecipe(openAgain, recipeId);

    const result = await saveRecipeEdit(openAgain, [draftItem(productId, 250)], {
      kind: "overwrite",
      alsoUpdateMealIds: [earlier],
    });
    if (result.kind !== "saved") throw new Error(result.kind);

    expect((await liveRows(earlier)).map((row) => Number(row.quantity))).toEqual([250]);
    expect(result.updatedMealNumbers).toHaveLength(1);
    expect(result.skippedMealNumbers).toHaveLength(0);
    // `open` was not ticked, so it keeps what it had.
    expect((await liveRows(open)).map((row) => Number(row.quantity))).toEqual([200]);
  });

  // The server re-checks; it does not trust the tick. The prompt was rendered
  // before the user hand-edited that meal in another tab.
  it("skips a ticked meal that diverged between the prompt and the save", async () => {
    const userId = await seedUser();
    signedInAs(userId);
    const productId = await seedProduct(userId);
    const { recipeId, open } = await linkedMeal(userId, productId);
    const earlier = await seedMeal(userId);
    await enterRecipe(earlier, recipeId);
    await db.update(mealIngredients).set({ quantity: "111.00" }).where(eq(mealIngredients.mealId, earlier));

    const result = await saveRecipeEdit(open, [draftItem(productId, 250)], {
      kind: "overwrite",
      alsoUpdateMealIds: [earlier],
    });
    if (result.kind !== "saved") throw new Error(result.kind);

    expect((await liveRows(earlier)).map((row) => Number(row.quantity))).toEqual([111]);
    expect(result.updatedMealNumbers).toHaveLength(0);
    expect(result.skippedMealNumbers).toHaveLength(1);
  });

  it("never rewrites a past day's meal even when its id is ticked", async () => {
    const userId = await seedUser();
    signedInAs(userId);
    const productId = await seedProduct(userId);
    const { recipeId, open } = await linkedMeal(userId, productId);
    const yesterdayMeal = await seedMeal(userId, YESTERDAY);
    await enterRecipe(yesterdayMeal, recipeId);

    await saveRecipeEdit(open, [draftItem(productId, 250)], {
      kind: "overwrite",
      alsoUpdateMealIds: [yesterdayMeal],
    });

    expect((await liveRows(yesterdayMeal)).map((row) => Number(row.quantity))).toEqual([200]);
  });

  it("new files a second recipe and leaves the source byte-identical", async () => {
    const userId = await seedUser();
    signedInAs(userId);
    const productId = await seedProduct(userId);
    const { recipeId, open } = await linkedMeal(userId, productId);
    const before = await db.select().from(recipeItems).where(eq(recipeItems.recipeId, recipeId));

    const result = await saveRecipeEdit(open, [draftItem(productId, 250)], { kind: "new", name: "Bigger yogurt" });
    if (result.kind !== "saved") throw new Error(result.kind);

    expect(result.recipeId).not.toBe(recipeId);
    expect(await db.select().from(recipeItems).where(eq(recipeItems.recipeId, recipeId))).toEqual(before);
    // Latest wins: the open meal now points at the new recipe.
    const [meal] = await db.select().from(meals).where(eq(meals.id, open));
    expect(meal.recipeId).toBe(result.recipeId);
  });

  it("new never touches an earlier meal, ticked or not", async () => {
    const userId = await seedUser();
    signedInAs(userId);
    const productId = await seedProduct(userId);
    const { recipeId, open: _open } = await linkedMeal(userId, productId);
    const earlier = await seedMeal(userId);
    await enterRecipe(earlier, recipeId);
    const openAgain = await seedMeal(userId);
    await enterRecipe(openAgain, recipeId);

    await saveRecipeEdit(openAgain, [draftItem(productId, 250)], { kind: "new", name: "Bigger yogurt" });

    expect((await liveRows(earlier)).map((row) => Number(row.quantity))).toEqual([200]);
  });

  it("new refuses a blank name and writes nothing", async () => {
    const userId = await seedUser();
    signedInAs(userId);
    const productId = await seedProduct(userId);
    const { open } = await linkedMeal(userId, productId);

    expect(await saveRecipeEdit(open, [draftItem(productId, 250)], { kind: "new", name: " " })).toEqual({
      kind: "invalid_name",
    });
    expect(await db.select().from(recipes)).toHaveLength(1);
    expect((await liveRows(open)).map((row) => Number(row.quantity))).toEqual([200]);
  });

  // [RF-3] The Save button is disabled client-side, which is not a guard.
  it("refuses an empty draft and writes nothing", async () => {
    const userId = await seedUser();
    signedInAs(userId);
    const productId = await seedProduct(userId);
    const { recipeId, open } = await linkedMeal(userId, productId);

    expect(await saveRecipeEdit(open, [], { kind: "overwrite", alsoUpdateMealIds: [] })).toEqual({ kind: "empty_draft" });
    expect(await db.select().from(recipeItems).where(eq(recipeItems.recipeId, recipeId))).toHaveLength(1);
    expect(await liveRows(open)).toHaveLength(1);
  });

  it("refuses a draft row with a non-positive amount", async () => {
    const userId = await seedUser();
    signedInAs(userId);
    const productId = await seedProduct(userId);
    const { open } = await linkedMeal(userId, productId);

    expect(await saveRecipeEdit(open, [draftItem(productId, 0)], { kind: "overwrite", alsoUpdateMealIds: [] })).toEqual({
      kind: "empty_draft",
    });
  });

  it("overwrite refuses an unlinked meal", async () => {
    const userId = await seedUser();
    signedInAs(userId);
    const productId = await seedProduct(userId);
    const mealId = await seedMeal(userId);
    await addIngredient(mealId, productId, 200);

    expect(await saveRecipeEdit(mealId, [draftItem(productId, 250)], { kind: "overwrite", alsoUpdateMealIds: [] })).toEqual({
      kind: "recipe_missing",
    });
  });

  it("refuses another user's meal", async () => {
    const owner = await seedUser();
    const intruder = await seedUser();
    signedInAs(owner);
    const productId = await seedProduct(owner);
    const { open } = await linkedMeal(owner, productId);

    signedInAs(intruder);
    expect(await saveRecipeEdit(open, [draftItem(productId, 250)], { kind: "overwrite", alsoUpdateMealIds: [] })).toEqual({
      kind: "meal_missing",
    });
  });

  // [RF-2b] Postgres hands `quantity` back as "250.00". A comparison that
  // forgets Number() reports every meal as diverged, which silently kills the
  // tick - the retro-update would appear to do nothing and say nothing.
  it("treats a meal written at the column's own scale as still matching", async () => {
    const userId = await seedUser();
    signedInAs(userId);
    const productId = await seedProduct(userId);
    const { recipeId, open: _open } = await linkedMeal(userId, productId);
    const earlier = await seedMeal(userId);
    await enterRecipe(earlier, recipeId);
    // Same figure, restated at full scale - a no-op rewrite, not an edit.
    await db.update(mealIngredients).set({ quantity: "200.00" }).where(eq(mealIngredients.mealId, earlier));
    const openAgain = await seedMeal(userId);
    await enterRecipe(openAgain, recipeId);

    const result = await saveRecipeEdit(openAgain, [draftItem(productId, 250)], {
      kind: "overwrite",
      alsoUpdateMealIds: [earlier],
    });
    if (result.kind !== "saved") throw new Error(result.kind);
    expect(result.updatedMealNumbers).toHaveLength(1);
  });
});
