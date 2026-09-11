import { eq, sql } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";

import { db } from "../src/lib/db";
import { products, users } from "../src/lib/db/schema";

import { findOrCreateSystemUser, seedProducts, seedStandardFoods } from "./seed";

const seedUser = async (): Promise<string> => {
  const [user] = await db
    .insert(users)
    .values({ email: `test-${crypto.randomUUID()}@example.com` })
    .returning();
  return user.id;
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
  });

  it("is idempotent — re-running updates values without duplicating rows", async () => {
    const systemUserId = await findOrCreateSystemUser();
    await seedStandardFoods(systemUserId);
    await db.update(products).set({ energyKcal: "1" }).where(eq(products.standardSlug, "banana"));

    const secondCount = await seedStandardFoods(systemUserId);

    const rows = await db.select().from(products).where(eq(products.source, "standard"));
    expect(rows).toHaveLength(secondCount);
    const [banana] = rows.filter((row) => row.standardSlug === "banana");
    expect(Number(banana.energyKcal)).toBeGreaterThan(1);
  });

  it("returns the same system user id on repeat calls", async () => {
    expect(await findOrCreateSystemUser()).toBe(await findOrCreateSystemUser());
  });
});
