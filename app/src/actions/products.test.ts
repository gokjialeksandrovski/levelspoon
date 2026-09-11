import { eq, sql } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockAuth = vi.fn();
vi.mock("@/auth", () => ({ auth: () => mockAuth() }));

import { db } from "@/lib/db";
import { products, users } from "@/lib/db/schema";
import { NOTHING_LEARNED } from "@/lib/measures/learn";

import { createProduct, findStoredMeasures, getProductForCorrection, matchProduct, topTwoScores, updateProduct } from "./products";
import type { CandidateRow } from "./products";

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

const seedStandardRow = async (row: {
  slug: string;
  name: string;
  category?: "whole" | "fat";
  servingUnit?: string | null;
  servingGrams?: number | null;
  densityGMl?: number | null;
}): Promise<string> => {
  const [sys] = await db
    .insert(users)
    .values({ email: `system-${crypto.randomUUID()}@per100.local` })
    .returning();
  const [product] = await db
    .insert(products)
    .values({
      name: row.name,
      source: "standard",
      standardSlug: row.slug,
      standardCategory: row.category ?? "whole",
      energyKcal: "89", fatG: "0.33", saturatesG: "0.11",
      carbohydrateG: "22.84", sugarsG: "12.23", proteinG: "1.09", saltG: "0",
      servingUnit: row.servingUnit ?? null,
      servingGrams:
        row.servingGrams === undefined || row.servingGrams === null ? null : String(row.servingGrams),
      densityGMl:
        row.densityGMl === undefined || row.densityGMl === null ? null : String(row.densityGMl),
      nutritionPhotoKey: null,
      createdByUserId: sys.id,
    })
    .returning({ id: products.id });
  return product.id;
};

beforeEach(async () => {
  await db.execute(sql`TRUNCATE TABLE products, meal_ingredients, meals CASCADE`);
  mockAuth.mockReset();
});

describe("matchProduct", () => {
  it("returns a confident match with no alternatives when only one product exists", async () => {
    const userId = await seedUser();
    await seedProduct(userId, "Olympus Greek Yogurt 2% Fat");
    mockAuth.mockResolvedValue({ user: { id: userId } });

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
    mockAuth.mockResolvedValue({ user: { id: userId } });

    const result = await matchProduct("Olympus Greek Yogurt Fat");

    expect(result.kind).toBe("ambiguous");
  });

  it("returns no_match when nothing scores above the ambiguous floor", async () => {
    const userId = await seedUser();
    await seedProduct(userId, "Olympus Greek Yogurt 2% Fat");
    mockAuth.mockResolvedValue({ user: { id: userId } });

    const result = await matchProduct("Completely Unrelated Product Name Zzz");

    expect(result.kind).toBe("no_match");
  });

  it("returns no_match against an empty products table", async () => {
    const userId = await seedUser();
    mockAuth.mockResolvedValue({ user: { id: userId } });

    const result = await matchProduct("Anything");
    expect(result.kind).toBe("no_match");
  });

  it("throws when there is no authenticated session", async () => {
    mockAuth.mockResolvedValue(null);

    await expect(matchProduct("Anything")).rejects.toThrow();
  });

  it("never returns a standard-source product", async () => {
    await seedStandardRow({ slug: "banana", name: "Banana" });
    const userId = await seedUser();
    mockAuth.mockResolvedValue({ user: { id: userId } });

    const result = await matchProduct("Banana");

    expect(result.kind).toBe("no_match");
  });

  it("still matches a user product when a same-name standard row exists", async () => {
    await seedStandardRow({ slug: "banana", name: "Banana" });
    const userId = await seedUser();
    await seedProduct(userId, "Banana");
    mockAuth.mockResolvedValue({ user: { id: userId } });

    const result = await matchProduct("Banana");

    expect(result.kind).toBe("confident");
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

  it("updates the name when provided", async () => {
    const userId = await seedUser();
    await seedProduct(userId, "Olympus Greek Yogurt 2% Fat");
    const [existing] = await db.select().from(products);
    mockAuth.mockResolvedValue({ user: { id: userId } });

    await updateProduct(existing.id, {
      name: "Olympus Greek Yogurt 0% Fat",
      nutritionPer100g: {
        energyKcal: 75, fatG: 2.5, saturatesG: 1.2, carbohydrateG: 4.0, sugarsG: 4.0, proteinG: 9.0, saltG: 0.18,
      },
    });

    const [updated] = await db.select().from(products).where(eq(products.id, existing.id));
    expect(updated.name).toBe("Olympus Greek Yogurt 0% Fat");
  });

  it("replaces the photo when provided", async () => {
    const userId = await seedUser();
    await seedProduct(userId, "Olympus Greek Yogurt 2% Fat");
    const [existing] = await db.select().from(products);
    mockAuth.mockResolvedValue({ user: { id: userId } });

    await updateProduct(existing.id, {
      nutritionPer100g: {
        energyKcal: 75, fatG: 2.5, saturatesG: 1.2, carbohydrateG: 4.0, sugarsG: 4.0, proteinG: 9.0, saltG: 0.18,
      },
      photo: new Blob([Buffer.from("new-photo-bytes")], { type: "image/jpeg" }),
    });

    const [updated] = await db.select().from(products).where(eq(products.id, existing.id));
    expect(updated.nutritionPhotoKey).toMatch(/^products\/.+/);
    expect(updated.nutritionPhotoKey).not.toBe(existing.nutritionPhotoKey);
  });
});

describe("getProductForCorrection", () => {
  it("returns the product's current values and a photo URL", async () => {
    const userId = await seedUser();
    await seedProduct(userId, "Olympus Greek Yogurt 2% Fat");
    const [existing] = await db.select().from(products);
    mockAuth.mockResolvedValue({ user: { id: userId } });

    const result = await getProductForCorrection(existing.id);

    expect(result?.name).toBe("Olympus Greek Yogurt 2% Fat");
    expect(result?.nutritionPer100g.energyKcal).toBe(70);
    expect(result?.photoUrl).toEqual(expect.stringContaining("http"));
  });

  it("returns null for a nonexistent product", async () => {
    const userId = await seedUser();
    mockAuth.mockResolvedValue({ user: { id: userId } });

    const result = await getProductForCorrection(crypto.randomUUID());
    expect(result).toBeNull();
  });
});

describe("standard-source product rows", () => {
  it("persist with a null nutrition photo key and a category", async () => {
    const id = await seedStandardRow({ slug: "banana", name: "Banana", category: "whole" });

    const [row] = await db.select().from(products).where(eq(products.id, id));
    expect(row.source).toBe("standard");
    expect(row.nutritionPhotoKey).toBeNull();
    expect(row.standardSlug).toBe("banana");
    expect(row.standardCategory).toBe("whole");
  });

  it("reject a duplicate standard_slug", async () => {
    await seedStandardRow({ slug: "banana", name: "Banana" });

    await expect(seedStandardRow({ slug: "banana", name: "Banana again" })).rejects.toThrow();
  });

  it("are not offered for correction", async () => {
    const id = await seedStandardRow({ slug: "banana", name: "Banana" });
    mockAuth.mockResolvedValue({ user: { id: crypto.randomUUID() } });

    expect(await getProductForCorrection(id)).toBeNull();
  });
});

const LEARNED_TEST_NUTRITION = {
  energyKcal: 480.8, fatG: 23.1, saturatesG: 8.7, carbohydrateG: 61.5,
  sugarsG: 53.8, proteinG: 7.7, saltG: 0.6,
};

const testPhoto = () => new Blob(["photo"], { type: "image/jpeg" });

describe("createProduct — learned measures", () => {
  it("stores a learned density on the new product row", async () => {
    const userId = await seedUser();
    mockAuth.mockResolvedValue({ user: { id: userId } });

    await createProduct({
      name: "Zzq Density Fixture",
      nutritionPer100g: LEARNED_TEST_NUTRITION,
      photo: testPhoto(),
      learned: { densityGMl: 1.2333, servingUnit: null, servingGrams: null },
    });

    const stored = await findStoredMeasures("Zzq Density Fixture");
    expect(stored.densityGMl).toBeCloseTo(1.2333, 4);
  });

  it("stores a learned serving unit and weight on the new product row", async () => {
    const userId = await seedUser();
    mockAuth.mockResolvedValue({ user: { id: userId } });

    await createProduct({
      name: "Zzq Bar Fixture",
      nutritionPer100g: LEARNED_TEST_NUTRITION,
      photo: testPhoto(),
      learned: { densityGMl: null, servingUnit: "bas", servingGrams: 52 },
    });

    const stored = await findStoredMeasures("Zzq Bar Fixture");
    expect(stored.servingUnit).toBe("bas");
    expect(stored.servingGrams).toBe(52);
  });

  it("leaves all three columns null when nothing was learned", async () => {
    const userId = await seedUser();
    mockAuth.mockResolvedValue({ user: { id: userId } });

    await createProduct({
      name: "Zzq Plain Fixture",
      nutritionPer100g: LEARNED_TEST_NUTRITION,
      photo: testPhoto(),
    });

    expect(await findStoredMeasures("Zzq Plain Fixture")).toEqual({
      densityGMl: null,
      servingUnit: null,
      servingGrams: null,
    });
  });
});

describe("findStoredMeasures", () => {
  it("returns all-null for a name that matches nothing", async () => {
    const userId = await seedUser();
    mockAuth.mockResolvedValue({ user: { id: userId } });

    expect(await findStoredMeasures("Xqv Nonexistent Product Wgh")).toEqual({
      densityGMl: null,
      servingUnit: null,
      servingGrams: null,
    });
  });

  it("does not borrow a trigram-similar product's learned measure for a different product", async () => {
    const userId = await seedUser();
    mockAuth.mockResolvedValue({ user: { id: userId } });

    await createProduct({
      name: "Zzq Bar Original",
      nutritionPer100g: LEARNED_TEST_NUTRITION,
      photo: testPhoto(),
      learned: { densityGMl: null, servingUnit: "bas", servingGrams: 52 },
    });
    await createProduct({
      name: "Zzq Bar Deluxe",
      nutritionPer100g: LEARNED_TEST_NUTRITION,
      photo: testPhoto(),
    });

    expect(await findStoredMeasures("Zzq Bar Deluxe")).toEqual({
      densityGMl: null,
      servingUnit: null,
      servingGrams: null,
    });
  });

  it("does not borrow a standard row's learned measures on an exact-name match", async () => {
    await seedStandardRow({
      slug: "zzq-learned-fixture",
      name: "Zzq Learned Fixture",
      servingUnit: "slice",
      servingGrams: 20,
    });
    mockAuth.mockResolvedValue({ user: { id: crypto.randomUUID() } });

    expect(await findStoredMeasures("Zzq Learned Fixture")).toEqual(NOTHING_LEARNED);
  });
});

describe("topTwoScores", () => {
  const row = (score: number): CandidateRow => ({
    id: "id",
    name: "name",
    brand: null,
    energy_kcal: "0",
    fat_g: "0",
    saturates_g: "0",
    carbohydrate_g: "0",
    sugars_g: "0",
    protein_g: "0",
    salt_g: "0",
    nutrition_photo_key: "key",
    score,
  });

  it("returns both scores when at least two rows are present", async () => {
    mockAuth.mockResolvedValue({ user: { id: crypto.randomUUID() } });

    expect(await topTwoScores([row(0.9), row(0.6)])).toEqual({ top1: 0.9, top2: 0.6 });
  });

  it("defaults the second score to 0 when only one row is present", async () => {
    mockAuth.mockResolvedValue({ user: { id: crypto.randomUUID() } });

    expect(await topTwoScores([row(0.9)])).toEqual({ top1: 0.9, top2: 0 });
  });
});
