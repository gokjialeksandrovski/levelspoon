import { eq, sql } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";

import { db } from "../src/lib/db";
import { products, users } from "../src/lib/db/schema";

import { seedProducts } from "./seed";

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
