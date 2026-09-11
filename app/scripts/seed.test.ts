import { eq, sql } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";

import { db } from "../src/lib/db";
import { products, users } from "../src/lib/db/schema";

import { assertNoDuplicateSlugs, assertValidStandardFood, findOrCreateSystemUser, seedProducts, seedStandardFoods, StandardFoodRowError, type StandardFoodFixture } from "./seed";

const seedUser = async (): Promise<string> => {
  const [user] = await db
    .insert(users)
    .values({ email: `test-${crypto.randomUUID()}@example.com` })
    .returning();
  return user.id;
};

const VALID_STANDARD_FOOD: StandardFoodFixture = {
  slug: "test-row",
  name: "Test Row",
  per100g: { energyKcal: 100, fatG: 1, saturatesG: 0.5, carbohydrateG: 10, sugarsG: 5, proteinG: 2, saltG: 0.1 },
  servingUnit: null,
  servingGrams: null,
  densityGMl: null,
  category: "whole",
};

beforeEach(async () => {
  await db.execute(sql`TRUNCATE TABLE products, meal_ingredients, meals CASCADE`);
});

describe("seedProducts", () => {
  it("inserts both seed products owned by the given user", async () => {
    const userId = await seedUser();

    await seedProducts(userId);

    const rows = await db.select().from(products).where(eq(products.createdByUserId, userId));
    expect(rows).toHaveLength(2);
    expect(rows.map((row) => row.name).sort()).toEqual([
      "Olympus Greek Yogurt 10% Fat",
      "Olympus Greek Yogurt 2% Fat",
    ]);
  });
});

describe("seedStandardFoods", () => {
  it("seeds the fixture as standard-source rows owned by the system user", async () => {
    const systemUserId = await findOrCreateSystemUser();

    const count = await seedStandardFoods(systemUserId);

    const rows = await db.select().from(products).where(eq(products.source, "standard"));
    expect(rows).toHaveLength(count);
    expect(count).toBeGreaterThan(0);
    expect(rows.every((row) => row.createdByUserId === systemUserId)).toBe(true);
    expect(rows.every((row) => row.nutritionPhotoKey === null)).toBe(true);
    expect(rows.every((row) => row.updatedByUserId === null)).toBe(true);
    expect(rows.every((row) => row.updatedAt === null)).toBe(true);
  });

  it("is idempotent — re-running updates values without duplicating rows", async () => {
    const systemUserId = await findOrCreateSystemUser();
    await seedStandardFoods(systemUserId);
    await db
      .update(products)
      .set({
        name: "Corrupted",
        energyKcal: "1",
        standardCategory: "fat",
        servingUnit: "corrupted-unit",
        servingGrams: "1",
      })
      .where(eq(products.standardSlug, "banana"));

    const secondCount = await seedStandardFoods(systemUserId);

    const rows = await db.select().from(products).where(eq(products.source, "standard"));
    expect(rows).toHaveLength(secondCount);
    const [banana] = rows.filter((row) => row.standardSlug === "banana");
    expect(banana.name).toBe("Banana");
    expect(Number(banana.energyKcal)).toBeGreaterThan(1);
    expect(banana.standardCategory).toBe("whole");
    expect(banana.servingUnit).toBe("medium");
    expect(Number(banana.servingGrams)).toBe(118);
  });

  it("returns the same system user id on repeat calls", async () => {
    expect(await findOrCreateSystemUser()).toBe(await findOrCreateSystemUser());
  });
});

describe("assertValidStandardFood", () => {
  it("accepts a fully valid row", () => {
    expect(() => assertValidStandardFood(VALID_STANDARD_FOOD)).not.toThrow();
  });

  it("rejects servingGrams set with servingUnit omitted entirely (not just null)", () => {
    const { servingUnit: _servingUnit, ...rowWithoutUnit } = VALID_STANDARD_FOOD;
    expect(() =>
      assertValidStandardFood({ ...rowWithoutUnit, servingGrams: 50 }),
    ).toThrow(StandardFoodRowError);
  });

  it("rejects a non-string servingUnit", () => {
    expect(() =>
      assertValidStandardFood({ ...VALID_STANDARD_FOOD, servingUnit: 42, servingGrams: 50 }),
    ).toThrow(StandardFoodRowError);
  });

  it("rejects a fat-category row with no densityGMl", () => {
    expect(() =>
      assertValidStandardFood({ ...VALID_STANDARD_FOOD, category: "fat", densityGMl: null }),
    ).toThrow(StandardFoodRowError);
  });
});

describe("assertNoDuplicateSlugs", () => {
  it("passes for unique slugs", () => {
    expect(() =>
      assertNoDuplicateSlugs([
        { ...VALID_STANDARD_FOOD, slug: "a" },
        { ...VALID_STANDARD_FOOD, slug: "b" },
      ]),
    ).not.toThrow();
  });

  it("throws on a repeated slug", () => {
    expect(() =>
      assertNoDuplicateSlugs([
        { ...VALID_STANDARD_FOOD, slug: "a" },
        { ...VALID_STANDARD_FOOD, slug: "a" },
      ]),
    ).toThrow(StandardFoodRowError);
  });
});
