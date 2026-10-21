import { sql } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockAuth = vi.fn();
vi.mock("@/auth", () => ({ auth: () => mockAuth() }));

import { db } from "@/lib/db";
import { toSearchText } from "@/lib/db/search-text";
import { products, users } from "@/lib/db/schema";

import { searchStandardFoods } from "./products";
import { clearPortionGrams, setPortionGrams } from "./portions";

const seedUser = async (): Promise<string> => {
  const [user] = await db
    .insert(users)
    .values({ email: `test-${crypto.randomUUID()}@example.com` })
    .returning();
  return user.id;
};

// Serving figures mirror fixtures/standard-foods.json - whole wheat's own 32 g
// slice is what the cross-product test leans on.
const seedStandardRow = async (row: { slug: string; name: string; servingGrams: number }): Promise<void> => {
  const [sys] = await db
    .insert(users)
    .values({ email: `system-${crypto.randomUUID()}@levelspoon.local` })
    .returning();
  await db.insert(products).values({
    name: row.name,
    nameSearch: toSearchText(row.name),
    source: "standard",
    standardSlug: row.slug,
    standardCategory: "whole",
    energyKcal: "265", fatG: "3.2", saturatesG: "0.7",
    carbohydrateG: "49", sugarsG: "5", proteinG: "9", saltG: "1.2",
    servingUnit: "slice",
    servingGrams: String(row.servingGrams),
    nutritionPhotoKey: null,
    createdByUserId: sys.id,
  });
};

beforeEach(async () => {
  await db.execute(sql`TRUNCATE TABLE products, product_overrides, portion_overrides, meal_ingredients, meals CASCADE`);
  mockAuth.mockReset();
  await seedStandardRow({ slug: "bread-white", name: "Bread, white", servingGrams: 28 });
  await seedStandardRow({ slug: "bread-whole-wheat", name: "Bread, whole wheat", servingGrams: 32 });
  mockAuth.mockResolvedValue({ user: { id: await seedUser() } });
});

describe("portion overrides", () => {
  const breadId = async () => {
    const [food] = await searchStandardFoods("bread white", "whole");
    return food.id;
  };

  it("replaces the standard figure for this user and this product only", async () => {
    await setPortionGrams(await breadId(), "slice", 32);
    const [food] = await searchStandardFoods("bread white", "whole");
    expect(food.portions).toEqual([
      { label: "slice", grams: 32 },
      { label: "slice, large", grams: 38 },
    ]);
  });

  it("leaves a different bread on its own figure", async () => {
    await setPortionGrams(await breadId(), "slice", 45);
    const [other] = await searchStandardFoods("bread whole wheat", "whole");
    expect(other.portions[0]).toEqual({ label: "slice", grams: 32 });
  });

  it("replaces rather than duplicates on a second edit", async () => {
    const id = await breadId();
    await setPortionGrams(id, "slice", 32);
    await setPortionGrams(id, "slice", 45);
    const [food] = await searchStandardFoods("bread white", "whole");
    expect(food.portions[0]).toEqual({ label: "slice", grams: 45 });
  });

  it("reverts to the standard figure when cleared", async () => {
    const id = await breadId();
    await setPortionGrams(id, "slice", 45);
    await clearPortionGrams(id, "slice");
    const [food] = await searchStandardFoods("bread white", "whole");
    expect(food.portions[0]).toEqual({ label: "slice", grams: 28 });
  });

  it("overrides one label without touching its sibling", async () => {
    const id = await breadId();
    await setPortionGrams(id, "slice", 45);
    const [food] = await searchStandardFoods("bread white", "whole");
    expect(food.portions[1]).toEqual({ label: "slice, large", grams: 38 });
  });

  it("refuses a non-positive weight", async () => {
    await expect(setPortionGrams(await breadId(), "slice", 0)).rejects.toThrow(/positive/i);
    await expect(setPortionGrams(await breadId(), "slice", -5)).rejects.toThrow(/positive/i);
  });

  it("does not leak another user's override", async () => {
    const id = await breadId();
    await setPortionGrams(id, "slice", 45);
    mockAuth.mockResolvedValue({ user: { id: await seedUser() } });
    const [food] = await searchStandardFoods("bread white", "whole");
    expect(food.portions[0]).toEqual({ label: "slice", grams: 28 });
  });
});
