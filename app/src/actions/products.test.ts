import { eq, sql } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockAuth = vi.fn();
vi.mock("@/auth", () => ({ auth: () => mockAuth() }));

import { db } from "@/lib/db";
import { products, users } from "@/lib/db/schema";

import { createProduct, matchProduct, updateProduct } from "./products";

const seedUser = async (): Promise<string> => {
  const [user] = await db
    .insert(users)
    .values({ email: `test-${crypto.randomUUID()}@example.com` })
    .returning();
  return user.id;
};

const seedProduct = async (userId: string, name: string) => {
  await db.insert(products).values({
    name,
    energyKcal: "70",
    fatG: "2.0",
    saturatesG: "1.2",
    carbohydrateG: "4.0",
    sugarsG: "4.0",
    proteinG: "9.0",
    saltG: "0.18",
    nutritionPhotoKey: "test/placeholder.jpg",
    createdByUserId: userId,
  });
};

beforeEach(async () => {
  await db.execute(sql`TRUNCATE TABLE products, meal_ingredients, meals CASCADE`);
  mockAuth.mockReset();
});

describe("matchProduct", () => {
  it("returns a confident match with no alternatives when only one product exists", async () => {
    const userId = await seedUser();
    await seedProduct(userId, "Olympus Greek Yogurt 2% Fat");

    const result = await matchProduct("Olympus Greek Yogurt 2 Fat");

    expect(result.kind).toBe("confident");
    if (result.kind === "confident") {
      expect(result.alternatives).toEqual([]);
    }
  });

  it("routes the 2%-vs-10% variant pair to ambiguous, not confident", async () => {
    // Measured directly against these two exact seeded strings (2026-08-28):
    // similarity("Olympus Greek Yogurt Fat", "...2% Fat") ~= 0.926
    // similarity("Olympus Greek Yogurt Fat", "...10% Fat") ~= 0.893
    // margin ~= 0.033, well under CONFIDENT_MARGIN (0.15) -> ambiguous.
    const userId = await seedUser();
    await seedProduct(userId, "Olympus Greek Yogurt 2% Fat");
    await seedProduct(userId, "Olympus Greek Yogurt 10% Fat");

    const result = await matchProduct("Olympus Greek Yogurt Fat");

    expect(result.kind).toBe("ambiguous");
  });

  it("returns no_match when nothing scores above the ambiguous floor", async () => {
    const userId = await seedUser();
    await seedProduct(userId, "Olympus Greek Yogurt 2% Fat");

    const result = await matchProduct("Completely Unrelated Product Name Zzz");

    expect(result.kind).toBe("no_match");
  });

  it("returns no_match against an empty products table", async () => {
    const result = await matchProduct("Anything");
    expect(result.kind).toBe("no_match");
  });
});

describe("createProduct", () => {
  it("writes a new product owned by the authenticated user", async () => {
    const userId = await seedUser();
    mockAuth.mockResolvedValue({ user: { id: userId } });

    const { productId } = await createProduct({
      name: "Fresh Milk 3.2%",
      nutritionPer100g: {
        energyKcal: 61,
        fatG: 3.2,
        saturatesG: 2.0,
        carbohydrateG: 4.8,
        sugarsG: 4.8,
        proteinG: 3.2,
        saltG: 0.1,
      },
      photo: new Blob([Buffer.from("fake-jpeg-bytes")], { type: "image/jpeg" }),
    });

    const [row] = await db.select().from(products).where(eq(products.id, productId));
    expect(row.name).toBe("Fresh Milk 3.2%");
    expect(row.nutritionPhotoKey).toMatch(/^products\/.+/);
    expect(row.createdByUserId).toBe(userId);
  });

  it("throws when there is no authenticated session", async () => {
    mockAuth.mockResolvedValue(null);

    await expect(
      createProduct({
        name: "Fresh Milk 3.2%",
        nutritionPer100g: {
          energyKcal: 61,
          fatG: 3.2,
          saturatesG: 2.0,
          carbohydrateG: 4.8,
          sugarsG: 4.8,
          proteinG: 3.2,
          saltG: 0.1,
        },
        photo: new Blob([Buffer.from("fake-jpeg-bytes")], { type: "image/jpeg" }),
      }),
    ).rejects.toThrow();
  });
});

describe("updateProduct", () => {
  it("updates nutrition values and stamps the corrector from the session", async () => {
    const userId = await seedUser();
    const correctorId = await seedUser();
    await seedProduct(userId, "Olympus Greek Yogurt 2% Fat");
    const [existing] = await db.select().from(products);
    mockAuth.mockResolvedValue({ user: { id: correctorId } });

    await updateProduct(existing.id, {
      nutritionPer100g: {
        energyKcal: 75,
        fatG: 2.5,
        saturatesG: 1.2,
        carbohydrateG: 4.0,
        sugarsG: 4.0,
        proteinG: 9.0,
        saltG: 0.18,
      },
    });

    const [updated] = await db.select().from(products).where(eq(products.id, existing.id));
    expect(Number(updated.energyKcal)).toBe(75);
    expect(updated.updatedByUserId).toBe(correctorId);
    expect(updated.updatedAt).not.toBeNull();
  });
});
