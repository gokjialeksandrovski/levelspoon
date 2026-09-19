import { and, eq, sql } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockAuth = vi.fn();
vi.mock("@/auth", () => ({ auth: () => mockAuth() }));

import { db } from "@/lib/db";
import { toSearchText } from "@/lib/db/search-text";
import { products, productBarcodes, productOverrides, users } from "@/lib/db/schema";
import { InvalidBarcodeError } from "@/lib/barcode/normalize";
import { NOTHING_LEARNED } from "@/lib/measures/learn";
import { fetchPhotoDebt } from "@/lib/db/photo-debt";
import { getPhotoUrl } from "@/lib/s3";

import { clearNutritionOverride, createProduct, findStoredMeasures, getProductForCorrection, matchProduct, renameOwnProduct, saveNutritionOverride, searchStandardFoods, searchUserProducts, topTwoScores } from "./products";
import type { CandidateRow } from "./products";
import { BarcodeAlreadyLinkedError, LabelPhotoAlreadyUsedError, ProductNotEditableError } from "./products.errors";

const seedUser = async (): Promise<string> => {
  const [user] = await db
    .insert(users)
    .values({ email: `test-${crypto.randomUUID()}@example.com` })
    .returning();
  return user.id;
};

const seedProduct = async (
  userId: string,
  name: string,
  overrides: {
    servingUnit?: string | null;
    servingGrams?: number | null;
    densityGMl?: string | null;
    nutritionPhotoKey?: string | null;
  } = {},
): Promise<string> => {
  const [row] = await db
    .insert(products)
    .values({
      name,
      nameSearch: toSearchText(name),
      energyKcal: "70",
      fatG: "2.0",
      saturatesG: "1.2",
      carbohydrateG: "4.0",
      sugarsG: "4.0",
      proteinG: "9.0",
      saltG: "0.18",
      nutritionPhotoKey:
        overrides.nutritionPhotoKey === undefined
          ? `test/${crypto.randomUUID()}.jpg`
          : overrides.nutritionPhotoKey,
      createdByUserId: userId,
      servingUnit: overrides.servingUnit ?? null,
      servingGrams:
        overrides.servingGrams === undefined || overrides.servingGrams === null
          ? null
          : String(overrides.servingGrams),
      densityGMl: overrides.densityGMl ?? null,
    })
    .returning({ id: products.id });
  return row.id;
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
      nameSearch: toSearchText(row.name),
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
  await db.execute(sql`TRUNCATE TABLE products, product_overrides, meal_ingredients, meals CASCADE`);
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
    // Measured against these exact seeded strings:
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

  it("carries a product's learned serving unit and weight through to the candidate", async () => {
    const userId = await seedUser();
    await seedProduct(userId, "Choc Bar", { servingUnit: "bar", servingGrams: 52 });
    mockAuth.mockResolvedValue({ user: { id: userId } });

    const result = await matchProduct("Choc Bar");

    expect(result.kind).toBe("confident");
    if (result.kind === "confident") {
      expect(result.product.servingUnit).toBe("bar");
      expect(result.product.servingGrams).toBe(52);
      expect(result.product.densityGMl).toBeNull();
    }
  });

  it("carries a product's own nutrition basis unit through to the candidate", async () => {
    const userId = await seedUser();
    await db.insert(products).values({
      name: "Nutella Choc Spread",
      nameSearch: "nutella choc spread",
      energyKcal: "100", fatG: "9", saturatesG: "3.5", carbohydrateG: "10", sugarsG: "10", proteinG: "1", saltG: "0.02",
      nutritionPhotoKey: "test/placeholder.jpg",
      createdByUserId: userId,
      nutritionBasisUnit: "tbsp",
      nutritionBasisQuantity: "1",
    });
    mockAuth.mockResolvedValue({ user: { id: userId } });

    const result = await matchProduct("Nutella Choc Spread");

    expect(result.kind).toBe("confident");
    if (result.kind === "confident") {
      expect(result.product.nutritionBasisUnit).toBe("tbsp");
    }
  });
});

describe("searchStandardFoods", () => {
  it("ranks a closer name first and includes weaker matches", async () => {
    await seedStandardRow({ slug: "banana", name: "Banana" });
    await seedStandardRow({ slug: "banana-bread", name: "Banana bread" });
    mockAuth.mockResolvedValue({ user: { id: crypto.randomUUID() } });

    const results = await searchStandardFoods("banana");

    expect(results[0].name).toBe("Banana");
    expect(results.map((row) => row.slug)).toContain("banana-bread");
  });

  it("is case-insensitive", async () => {
    await seedStandardRow({ slug: "banana", name: "Banana" });
    mockAuth.mockResolvedValue({ user: { id: crypto.randomUUID() } });

    expect((await searchStandardFoods("BANANA")).map((row) => row.slug)).toEqual(["banana"]);
  });

  it("filters by category", async () => {
    await seedStandardRow({ slug: "coconut-oil", name: "Coconut oil", category: "fat", densityGMl: 0.92 });
    await seedStandardRow({ slug: "coconut", name: "Coconut", category: "whole" });
    mockAuth.mockResolvedValue({ user: { id: crypto.randomUUID() } });

    const fats = await searchStandardFoods("coconut", "fat");

    expect(fats.map((row) => row.slug)).toEqual(["coconut-oil"]);
  });

  it("returns nothing for a no-hope query", async () => {
    await seedStandardRow({ slug: "banana", name: "Banana" });
    mockAuth.mockResolvedValue({ user: { id: crypto.randomUUID() } });

    expect(await searchStandardFoods("xqzwvk")).toEqual([]);
  });

  it("finds a name written in another script from its romanization", async () => {
    await seedStandardRow({ slug: "sirenje", name: "Сирење" });
    mockAuth.mockResolvedValue({ user: { id: crypto.randomUUID() } });

    expect((await searchStandardFoods("sirene")).map((row) => row.slug)).toEqual(["sirenje"]);
    expect((await searchStandardFoods("sirenje")).map((row) => row.slug)).toEqual(["sirenje"]);
  });

  it("round-trips learned serving and density fields as numbers", async () => {
    await seedStandardRow({
      slug: "egg-whole-raw", name: "Egg", category: "whole", servingUnit: "large", servingGrams: 50,
    });
    await seedStandardRow({
      slug: "olive-oil", name: "Olive oil", category: "fat", densityGMl: 0.92,
    });
    mockAuth.mockResolvedValue({ user: { id: crypto.randomUUID() } });

    const [egg] = await searchStandardFoods("Egg");
    const [oil] = await searchStandardFoods("Olive oil");

    expect(egg.servingUnit).toBe("large");
    expect(egg.servingGrams).toBe(50);
    expect(egg.densityGMl).toBeNull();
    expect(oil.densityGMl).toBeCloseTo(0.92, 2);
    expect(oil.servingGrams).toBeNull();
  });

  it("surfaces the default per-100g basis on every standard row", async () => {
    await seedStandardRow({ slug: "banana", name: "Banana" });
    mockAuth.mockResolvedValue({ user: { id: crypto.randomUUID() } });

    const [banana] = await searchStandardFoods("Banana");

    expect(banana.nutritionBasisUnit).toBe("g");
  });

  it("throws when there is no authenticated session", async () => {
    mockAuth.mockResolvedValue(null);

    await expect(searchStandardFoods("banana")).rejects.toThrow();
  });
});

describe("searchUserProducts", () => {
  it("finds a product from a single keyword in the middle of its name", async () => {
    const userId = await seedUser();
    await seedProduct(userId, "Bella Farm YOGHURT 2,8% m.m 1kr/kg");
    mockAuth.mockResolvedValue({ user: { id: userId } });

    const results = await searchUserProducts("yogh");

    expect(results.map((row) => row.name)).toEqual(["Bella Farm YOGHURT 2,8% m.m 1kr/kg"]);
  });

  it("matches a leading keyword case-insensitively", async () => {
    const userId = await seedUser();
    await seedProduct(userId, "Bella Farm YOGHURT 2,8% m.m 1kr/kg");
    mockAuth.mockResolvedValue({ user: { id: userId } });

    expect((await searchUserProducts("BELLA")).length).toBe(1);
  });

  it("requires every token to appear, so a wrong second word excludes the row", async () => {
    const userId = await seedUser();
    await seedProduct(userId, "Bella Farm YOGHURT 2,8% m.m 1kr/kg");
    mockAuth.mockResolvedValue({ user: { id: userId } });

    expect(await searchUserProducts("bella cheese")).toEqual([]);
    expect((await searchUserProducts("bella yoghurt")).length).toBe(1);
  });

  it("never returns standard rows - a typed search is for packaged products", async () => {
    const userId = await seedUser();
    await seedStandardRow({ slug: "banana", name: "Banana" });
    mockAuth.mockResolvedValue({ user: { id: userId } });

    expect(await searchUserProducts("banana")).toEqual([]);
  });

  it("treats a typed % as a literal, not a wildcard", async () => {
    const userId = await seedUser();
    await seedProduct(userId, "Olympus Greek Yogurt 2% Fat");
    await seedProduct(userId, "Plain Skyr");
    mockAuth.mockResolvedValue({ user: { id: userId } });

    expect((await searchUserProducts("2%")).map((row) => row.name)).toEqual([
      "Olympus Greek Yogurt 2% Fat",
    ]);
  });

  it("returns nothing for a blank query rather than every product", async () => {
    const userId = await seedUser();
    await seedProduct(userId, "Bella Farm YOGHURT 2,8% m.m 1kr/kg");
    mockAuth.mockResolvedValue({ user: { id: userId } });

    expect(await searchUserProducts("   ")).toEqual([]);
  });

  it("requires a signed-in user", async () => {
    mockAuth.mockResolvedValue(null);

    await expect(searchUserProducts("bella")).rejects.toThrow();
  });

  it("finds a name written in another script, typed either way", async () => {
    const userId = await seedUser();
    await seedProduct(userId, "Сирење");
    mockAuth.mockResolvedValue({ user: { id: userId } });

    expect((await searchUserProducts("sirenje")).map((row) => row.name)).toEqual(["Сирење"]);
    expect((await searchUserProducts("Сирење")).map((row) => row.name)).toEqual(["Сирење"]);
  });

  it("still finds it when the romanization the user typed is not the one the table holds", async () => {
    const userId = await seedUser();
    await seedProduct(userId, "Сирење");
    mockAuth.mockResolvedValue({ user: { id: userId } });

    expect((await searchUserProducts("sirene")).map((row) => row.name)).toEqual(["Сирење"]);
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

  it("defaults to a per-100g basis when none is given", async () => {
    const userId = await seedUser();
    mockAuth.mockResolvedValue({ user: { id: userId } });

    const { productId } = await createProduct({
      name: "Fresh Milk 3.2%",
      nutritionPer100g: {
        energyKcal: 61, fatG: 3.2, saturatesG: 2.0, carbohydrateG: 4.8, sugarsG: 4.8, proteinG: 3.2, saltG: 0.1,
      },
      photo: new Blob([Buffer.from("fake-jpeg-bytes")], { type: "image/jpeg" }),
    });

    const [row] = await db.select().from(products).where(eq(products.id, productId));
    expect(row.nutritionBasisUnit).toBe("g");
    expect(Number(row.nutritionBasisQuantity)).toBe(100);
  });

  it("stores a custom nutrition basis when the capture pipeline supplies one", async () => {
    const userId = await seedUser();
    mockAuth.mockResolvedValue({ user: { id: userId } });

    const { productId } = await createProduct({
      name: "Nutella Hazelnut Spread",
      nutritionPer100g: {
        energyKcal: 95, fatG: 8, saturatesG: 1.5, carbohydrateG: 3.5, sugarsG: 3, proteinG: 4, saltG: 0.0225,
      },
      photo: new Blob([Buffer.from("fake-jpeg-bytes")], { type: "image/jpeg" }),
      nutritionBasisUnit: "tbsp",
      nutritionBasisQuantity: 1,
    });

    const [row] = await db.select().from(products).where(eq(products.id, productId));
    expect(row.nutritionBasisUnit).toBe("tbsp");
    expect(Number(row.nutritionBasisQuantity)).toBe(1);
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

  it("creates a product with no photo, leaving nutritionPhotoKey null", async () => {
    const userId = await seedUser();
    mockAuth.mockResolvedValue({ user: { id: userId } });

    const { productId } = await createProduct({
      name: "Loose Banana",
      nutritionPer100g: {
        energyKcal: 89, fatG: 0.33, saturatesG: 0.11, carbohydrateG: 22.84,
        sugarsG: 12.23, proteinG: 1.09, saltG: 0,
      },
    });

    const [row] = await db.select().from(products).where(eq(products.id, productId));
    expect(row.nutritionPhotoKey).toBeNull();
  });

  it("defaults nutritionOrigin to label_photo when not given", async () => {
    const userId = await seedUser();
    mockAuth.mockResolvedValue({ user: { id: userId } });

    const { productId } = await createProduct({
      name: "Fresh Milk 3.2%",
      nutritionPer100g: {
        energyKcal: 61, fatG: 3.2, saturatesG: 2.0, carbohydrateG: 4.8, sugarsG: 4.8, proteinG: 3.2, saltG: 0.1,
      },
      photo: new Blob([Buffer.from("fake-jpeg-bytes")], { type: "image/jpeg" }),
    });

    const [row] = await db.select().from(products).where(eq(products.id, productId));
    expect(row.nutritionOrigin).toBe("label_photo");
  });

  it("stores a given nutritionOrigin and attaches a barcode transactionally", async () => {
    const userId = await seedUser();
    mockAuth.mockResolvedValue({ user: { id: userId } });

    const { productId } = await createProduct({
      name: "Test Cereal",
      nutritionPer100g: {
        energyKcal: 380, fatG: 5, saturatesG: 1, carbohydrateG: 70, sugarsG: 20, proteinG: 8, saltG: 1.1,
      },
      nutritionOrigin: "open_food_facts",
      barcode: "5901234123457",
    });

    const [row] = await db.select().from(products).where(eq(products.id, productId));
    expect(row.nutritionOrigin).toBe("open_food_facts");

    const [barcodeRow] = await db.select().from(productBarcodes).where(eq(productBarcodes.barcode, "5901234123457"));
    expect(barcodeRow.productId).toBe(productId);
    expect(barcodeRow.createdByUserId).toBe(userId);
  });

  it("rejects an invalid barcode before writing anything or uploading a photo", async () => {
    const userId = await seedUser();
    mockAuth.mockResolvedValue({ user: { id: userId } });

    await expect(
      createProduct({
        name: "Bad Barcode Product",
        nutritionPer100g: {
          energyKcal: 380, fatG: 5, saturatesG: 1, carbohydrateG: 70, sugarsG: 20, proteinG: 8, saltG: 1.1,
        },
        photo: new Blob([Buffer.from("fake-jpeg-bytes")], { type: "image/jpeg" }),
        barcode: "5901234123458",
      }),
    ).rejects.toThrow(InvalidBarcodeError);

    expect(await db.select().from(products)).toEqual([]);
  });

  it("throws a named error, not a raw driver error, when the barcode is already linked", async () => {
    const userId = await seedUser();
    mockAuth.mockResolvedValue({ user: { id: userId } });
    const nutritionPer100g = {
      energyKcal: 380, fatG: 5, saturatesG: 1, carbohydrateG: 70, sugarsG: 20, proteinG: 8, saltG: 1.1,
    };
    await createProduct({ name: "First Owner", nutritionPer100g, barcode: "0012345678905" });

    // Same code in its non-canonical UPC-A form - the collision is on the
    // normalized value, not the raw string.
    await expect(
      createProduct({ name: "Second Claimant", nutritionPer100g, barcode: "012345678905" }),
    ).rejects.toThrow(BarcodeAlreadyLinkedError);

    expect(await db.select().from(products)).toHaveLength(1);
  });

  // Same figures the earlier tests in this block already use inline - not a
  // new fixture, just a name so this test and the next can share one.
  const CREATED = {
    energyKcal: 61, fatG: 3.2, saturatesG: 2.0, carbohydrateG: 4.8, sugarsG: 4.8, proteinG: 3.2, saltG: 0.1,
  };

  it("refuses a second product carrying the first product's label photo, naming the owner", async () => {
    const userId = await seedUser();
    mockAuth.mockResolvedValue({ user: { id: userId } });
    const label = () => new Blob(["shared-label-bytes"], { type: "image/jpeg" });
    await createProduct({ name: "Bella Farm Yoghurt", nutritionPer100g: CREATED, photo: label() });

    const rejection = createProduct({ name: "Candy Bar", nutritionPer100g: CREATED, photo: label() });

    await expect(rejection).rejects.toThrow(LabelPhotoAlreadyUsedError);
    await expect(rejection).rejects.toMatchObject({ ownerName: "Bella Farm Yoghurt" });
  });

  it("refuses a claim photo already used as another product's proof", async () => {
    const userId = await seedUser();
    mockAuth.mockResolvedValue({ user: { id: userId } });
    const label = () => new Blob(["proof-bytes"], { type: "image/jpeg" });
    await createProduct({ name: "Bella Farm Yoghurt", nutritionPer100g: CREATED, photo: label() });
    const otherProductId = await seedProduct(userId, "Some Other Product");

    await expect(
      saveNutritionOverride(otherProductId, CORRECTED, label()),
    ).rejects.toThrow(LabelPhotoAlreadyUsedError);
  });

  // The invisible owner is an override row, not a product row: a product row
  // carrying a photo is visible to everyone through visibleToUser's photo arm,
  // so "cannot see" is unreachable there, while an override belongs to one
  // user and is never surfaced to another.
  it("refuses without naming a row this user cannot see", async () => {
    const authorId = await seedUser();
    mockAuth.mockResolvedValue({ user: { id: authorId } });
    const productId = await seedProduct(authorId, "Bella Farm Yoghurt");
    const claim = () => new Blob(["claim-bytes"], { type: "image/jpeg" });
    await saveNutritionOverride(productId, CORRECTED, claim());

    const otherUserId = await seedUser();
    mockAuth.mockResolvedValue({ user: { id: otherUserId } });

    const rejection = createProduct({ name: "Candy Bar", nutritionPer100g: CREATED, photo: claim() });

    await expect(rejection).rejects.toThrow(LabelPhotoAlreadyUsedError);
    await expect(rejection).rejects.toMatchObject({ ownerName: null });
  });
});

describe("getProductForCorrection", () => {
  it("returns the product's current values", async () => {
    const userId = await seedUser();
    await seedProduct(userId, "Olympus Greek Yogurt 2% Fat");
    const [existing] = await db.select().from(products);
    mockAuth.mockResolvedValue({ user: { id: userId } });

    const result = await getProductForCorrection(existing.id);

    expect(result?.name).toBe("Olympus Greek Yogurt 2% Fat");
    expect(result?.nutritionPer100g.energyKcal).toBe(70);
  });

  it("surfaces the nutrition basis for a per-unit product", async () => {
    const userId = await seedUser();
    mockAuth.mockResolvedValue({ user: { id: userId } });
    const { productId } = await createProduct({
      name: "Nutella Hazelnut Spread 2",
      nutritionPer100g: {
        energyKcal: 95, fatG: 8, saturatesG: 1.5, carbohydrateG: 3.5, sugarsG: 3, proteinG: 4, saltG: 0.0225,
      },
      photo: new Blob([Buffer.from("fake-jpeg-bytes")], { type: "image/jpeg" }),
      nutritionBasisUnit: "tbsp",
      nutritionBasisQuantity: 1,
    });

    const result = await getProductForCorrection(productId);

    expect(result?.nutritionBasisUnit).toBe("tbsp");
    expect(result?.nutritionBasisQuantity).toBe(1);
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

// A fresh UUID per call, not a fixed literal: a content-addressed key means
// two calls with identical bytes collide on the same UNIQUE column, and some
// tests below call this twice to create two distinct products.
const testPhoto = () => new Blob([crypto.randomUUID()], { type: "image/jpeg" });

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

  it("returns a user product's own learned measures when a same-name standard row also exists", async () => {
    await seedStandardRow({
      slug: "zzq-learned-fixture-2",
      name: "Zzq Learned Fixture Two",
      servingUnit: "slice",
      servingGrams: 20,
    });
    const userId = await seedUser();
    mockAuth.mockResolvedValue({ user: { id: userId } });
    await createProduct({
      name: "Zzq Learned Fixture Two",
      nutritionPer100g: LEARNED_TEST_NUTRITION,
      photo: testPhoto(),
      learned: { densityGMl: null, servingUnit: "bar", servingGrams: 99 },
    });

    expect(await findStoredMeasures("Zzq Learned Fixture Two")).toEqual({
      densityGMl: null,
      servingUnit: "bar",
      servingGrams: 99,
    });
  });
});

describe("private products", () => {
  const PHOTOLESS = { nutritionPhotoKey: null };

  it("keeps another user's photo-less product out of the match candidates", async () => {
    const author = await seedUser();
    const other = await seedUser();
    await seedProduct(author, "Bella Farm Yoghurt", PHOTOLESS);
    mockAuth.mockResolvedValue({ user: { id: other } });

    const result = await matchProduct("Bella Farm Yoghurt");

    expect(result).toEqual({ kind: "no_match" });
  });

  it("offers the author their own photo-less product", async () => {
    const author = await seedUser();
    await seedProduct(author, "Bella Farm Yoghurt", PHOTOLESS);
    mockAuth.mockResolvedValue({ user: { id: author } });

    const result = await matchProduct("Bella Farm Yoghurt");

    expect(result.kind).toBe("confident");
  });

  it("shares a photo-less product once a barcode is linked to it", async () => {
    const author = await seedUser();
    const other = await seedUser();
    const productId = await seedProduct(author, "Bella Farm Yoghurt", PHOTOLESS);
    await db.insert(productBarcodes).values({
      barcode: "4006381333931",
      productId,
      createdByUserId: author,
    });
    mockAuth.mockResolvedValue({ user: { id: other } });

    const result = await matchProduct("Bella Farm Yoghurt");

    expect(result.kind).toBe("confident");
  });

  it("keeps another user's photo-less product out of typed search", async () => {
    const author = await seedUser();
    const other = await seedUser();
    await seedProduct(author, "Bella Farm Yoghurt", PHOTOLESS);
    mockAuth.mockResolvedValue({ user: { id: other } });

    const hits = await searchUserProducts("bella");

    expect(hits).toEqual([]);
  });

  it("finds the author's own photo-less product in typed search", async () => {
    const author = await seedUser();
    await seedProduct(author, "Bella Farm Yoghurt", PHOTOLESS);
    mockAuth.mockResolvedValue({ user: { id: author } });

    const hits = await searchUserProducts("bella");

    expect(hits.map((hit) => hit.name)).toEqual(["Bella Farm Yoghurt"]);
  });

  it("does not lend a private product's learned measures to another user", async () => {
    const author = await seedUser();
    const other = await seedUser();
    await seedProduct(author, "Protein Bar", { ...PHOTOLESS, servingUnit: "bar", servingGrams: 60 });
    mockAuth.mockResolvedValue({ user: { id: other } });

    const learned = await findStoredMeasures("Protein Bar");

    expect(learned.servingGrams).toBeNull();
  });

  it("saves a product with neither a photo nor a barcode", async () => {
    const author = await seedUser();
    mockAuth.mockResolvedValue({ user: { id: author } });

    const { productId } = await createProduct({
      name: "Six Eggs From The Market",
      nutritionPer100g: {
        energyKcal: 70, fatG: 2, saturatesG: 1.2, carbohydrateG: 4,
        sugarsG: 4, proteinG: 9, saltG: 0.18,
      },
    });

    expect(productId).toBeTruthy();
  });
});

describe("topTwoScores", () => {
  const row = (score: number): CandidateRow => ({
    id: "id",
    name: "name",
    brand: null,
    name_search: "name",
    standard_slug: null,
    energy_kcal: "0",
    fat_g: "0",
    saturates_g: "0",
    carbohydrate_g: "0",
    sugars_g: "0",
    protein_g: "0",
    salt_g: "0",
    nutrition_photo_key: "key",
    density_g_ml: null,
    serving_unit: null,
    serving_grams: null,
    nutrition_basis_unit: "g",
    nutrition_basis_quantity: "100",
    portion_overrides: {},
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

const CORRECTED = {
  energyKcal: 99, fatG: 3, saturatesG: 1.5, carbohydrateG: 5,
  sugarsG: 5, proteinG: 10, saltG: 0.2,
};
const CORRECTED_AGAIN = { ...CORRECTED, energyKcal: 101 };

const seedOne = async (name: string): Promise<{ userId: string; productId: string }> => {
  const userId = await seedUser();
  const productId = await seedProduct(userId, name);
  mockAuth.mockResolvedValue({ user: { id: userId } });
  return { userId, productId };
};

describe("nutrition overrides", () => {
  it("leaves the canonical row untouched when an override is saved", async () => {
    const { productId } = await seedOne("Olympus Greek Yogurt 2% Fat");

    await saveNutritionOverride(productId, CORRECTED);

    const [row] = await db.select().from(products).where(eq(products.id, productId));
    expect(Number(row.energyKcal)).toBe(70);
  });

  it("keeps exactly one override row per user and product", async () => {
    const { userId, productId } = await seedOne("Olympus Greek Yogurt 2% Fat");

    await saveNutritionOverride(productId, CORRECTED);
    await saveNutritionOverride(productId, CORRECTED_AGAIN);

    const rows = await db.select().from(productOverrides).where(eq(productOverrides.userId, userId));
    expect(rows.length).toBe(1);
    expect(Number(rows[0].energyKcal)).toBe(101);
  });

  it("serves the override to its own user through getProductForCorrection", async () => {
    const { productId } = await seedOne("Olympus Greek Yogurt 2% Fat");
    await saveNutritionOverride(productId, CORRECTED);

    const product = await getProductForCorrection(productId);

    expect(product?.nutritionPer100g.energyKcal).toBe(99);
    expect(product?.originalNutritionPer100g.energyKcal).toBe(70);
    expect(product?.hasOverride).toBe(true);
  });

  it("does not leak one user's override to another user", async () => {
    const { productId } = await seedOne("Olympus Greek Yogurt 2% Fat");
    await saveNutritionOverride(productId, CORRECTED);

    const otherUserId = await seedUser();
    mockAuth.mockResolvedValue({ user: { id: otherUserId } });

    const product = await getProductForCorrection(productId);
    expect(product?.nutritionPer100g.energyKcal).toBe(70);
    expect(product?.hasOverride).toBe(false);
  });

  it("restores the original figures when the override is cleared", async () => {
    const { productId } = await seedOne("Olympus Greek Yogurt 2% Fat");
    await saveNutritionOverride(productId, CORRECTED);

    await clearNutritionOverride(productId);

    const product = await getProductForCorrection(productId);
    expect(product?.nutritionPer100g.energyKcal).toBe(70);
    expect(product?.hasOverride).toBe(false);
  });

  it("is a no-op, not a failure, when clearing with no override present", async () => {
    const { productId } = await seedOne("Olympus Greek Yogurt 2% Fat");

    await expect(clearNutritionOverride(productId)).resolves.toBeUndefined();
  });

  it("refuses an override on a standard row", async () => {
    const userId = await seedUser();
    const standardId = await seedStandardRow({ slug: "banana", name: "Banana" });
    mockAuth.mockResolvedValue({ user: { id: userId } });

    await expect(saveNutritionOverride(standardId, CORRECTED)).rejects.toThrow(ProductNotEditableError);
  });

  it("refuses an override on another user's photo-less, barcode-less product", async () => {
    const authorId = await seedUser();
    const productId = await seedProduct(authorId, "Homemade Soup", { nutritionPhotoKey: null });
    const otherUserId = await seedUser();
    mockAuth.mockResolvedValue({ user: { id: otherUserId } });

    await expect(saveNutritionOverride(productId, CORRECTED)).rejects.toThrow(ProductNotEditableError);
  });

  it("still lets the author correct their own photo-less, barcode-less product", async () => {
    const authorId = await seedUser();
    const productId = await seedProduct(authorId, "Homemade Soup", { nutritionPhotoKey: null });
    mockAuth.mockResolvedValue({ user: { id: authorId } });

    await expect(saveNutritionOverride(productId, CORRECTED)).resolves.toBeUndefined();
  });

  it("renames a row the user created", async () => {
    const { productId } = await seedOne("Olymus Greek Yogurt 2% Fat");

    await renameOwnProduct(productId, "Olympus Greek Yogurt 2% Fat");

    const [row] = await db.select().from(products).where(eq(products.id, productId));
    expect(row.name).toBe("Olympus Greek Yogurt 2% Fat");
  });

  it("refuses to rename a row another user created", async () => {
    const { productId } = await seedOne("Olympus Greek Yogurt 2% Fat");
    const otherUserId = await seedUser();
    mockAuth.mockResolvedValue({ user: { id: otherUserId } });

    await expect(renameOwnProduct(productId, "Anything")).rejects.toThrow(ProductNotEditableError);
  });
});

describe("replacement label photos", () => {
  const newLabelPhoto = () => new Blob(["fake-jpeg-bytes"], { type: "image/jpeg" });
  const otherLabelPhoto = () => new Blob(["other-fake-jpeg-bytes"], { type: "image/jpeg" });

  const overrideOf = async (userId: string, productId: string) => {
    const [row] = await db
      .select()
      .from(productOverrides)
      .where(and(eq(productOverrides.userId, userId), eq(productOverrides.productId, productId)));
    return row;
  };

  it("attaches the photo to the override and leaves the canonical proof alone", async () => {
    const { userId, productId } = await seedOne("Olympus Greek Yogurt 2% Fat");
    const [before] = await db.select().from(products).where(eq(products.id, productId));

    await saveNutritionOverride(productId, CORRECTED, newLabelPhoto());

    const override = await overrideOf(userId, productId);
    const [product] = await db.select().from(products).where(eq(products.id, productId));
    expect(override.nutritionPhotoKey).toMatch(/^product-claims\//);
    expect(product.nutritionPhotoKey).toBe(before.nutritionPhotoKey);
  });

  it("keeps the attached photo when the figures are re-saved without one", async () => {
    const { userId, productId } = await seedOne("Olympus Greek Yogurt 2% Fat");
    await saveNutritionOverride(productId, CORRECTED, newLabelPhoto());
    const first = await overrideOf(userId, productId);

    await saveNutritionOverride(productId, CORRECTED_AGAIN);

    const second = await overrideOf(userId, productId);
    expect(second.nutritionPhotoKey).toBe(first.nutritionPhotoKey);
    expect(Number(second.energyKcal)).toBe(101);
  });

  it("keeps only the latest photo, and deletes the one it replaced", async () => {
    const { userId, productId } = await seedOne("Olympus Greek Yogurt 2% Fat");
    await saveNutritionOverride(productId, CORRECTED, newLabelPhoto());
    const first = await overrideOf(userId, productId);

    await saveNutritionOverride(productId, CORRECTED, otherLabelPhoto());

    const second = await overrideOf(userId, productId);
    expect(second.nutritionPhotoKey).not.toBe(first.nutritionPhotoKey);
    const staleResponse = await fetch(await getPhotoUrl(first.nutritionPhotoKey!));
    expect(staleResponse.ok).toBe(false);
  });

  it("keeps the object when the identical file is re-saved", async () => {
    const { userId, productId } = await seedOne("Olympus Greek Yogurt 2% Fat");
    await saveNutritionOverride(productId, CORRECTED, newLabelPhoto());
    const first = await overrideOf(userId, productId);

    await saveNutritionOverride(productId, CORRECTED_AGAIN, newLabelPhoto());

    const second = await overrideOf(userId, productId);
    expect(second.nutritionPhotoKey).toBe(first.nutritionPhotoKey);
    const liveResponse = await fetch(await getPhotoUrl(second.nutritionPhotoKey!));
    expect(liveResponse.ok).toBe(true);
  });

  it("deletes the photo when the correction is reverted", async () => {
    const { userId, productId } = await seedOne("Olympus Greek Yogurt 2% Fat");
    await saveNutritionOverride(productId, CORRECTED, newLabelPhoto());
    const saved = await overrideOf(userId, productId);

    await clearNutritionOverride(productId);

    const staleResponse = await fetch(await getPhotoUrl(saved.nutritionPhotoKey!));
    expect(staleResponse.ok).toBe(false);
  });

  it("reports one entry per product however many users claimed it", async () => {
    const { productId } = await seedOne("Olympus Greek Yogurt 2% Fat");
    await saveNutritionOverride(productId, CORRECTED, newLabelPhoto());
    const otherUserId = await seedUser();
    mockAuth.mockResolvedValue({ user: { id: otherUserId } });
    // A distinct photo, not a second newLabelPhoto() - two different users'
    // claim rows now collide on the same UNIQUE column if their bytes match.
    await saveNutritionOverride(productId, CORRECTED_AGAIN, otherLabelPhoto());

    const debt = await fetchPhotoDebt();

    expect(debt.length).toBe(1);
    expect(debt[0].productId).toBe(productId);
    expect(debt[0].claimCount).toBe(2);
  });

  it("leaves a plain correction out of the report", async () => {
    const { productId } = await seedOne("Olympus Greek Yogurt 2% Fat");

    await saveNutritionOverride(productId, CORRECTED);

    expect(await fetchPhotoDebt()).toEqual([]);
  });
});

describe("portions on product DTOs", () => {
  // Serving figures mirror fixtures/standard-foods.json, since it is that
  // fixture's own 32 g slice the precedence test is about.
  const seedCuratedFoods = async (): Promise<void> => {
    await seedStandardRow({ slug: "bread-white", name: "Bread, white", servingUnit: "slice", servingGrams: 28 });
    await seedStandardRow({ slug: "bread-whole-wheat", name: "Bread, whole wheat", servingUnit: "slice", servingGrams: 32 });
    await seedStandardRow({ slug: "egg-boiled", name: "Egg, boiled", servingUnit: "large", servingGrams: 50 });
    await seedStandardRow({ slug: "chicken-breast-raw", name: "Chicken breast, raw" });
    mockAuth.mockResolvedValue({ user: { id: crypto.randomUUID() } });
  };

  it("gives a curated bread standard food its slice portions", async () => {
    await seedCuratedFoods();

    const [food] = await searchStandardFoods("bread white", "whole");

    expect(food.portions).toEqual([
      { label: "slice", grams: 28 },
      { label: "slice, large", grams: 38 },
    ]);
  });

  it("prefers whole wheat's own 32 g slice over the class default", async () => {
    await seedCuratedFoods();

    const [food] = await searchStandardFoods("bread whole wheat", "whole");

    expect(food.portions[0]).toEqual({ label: "slice", grams: 32 });
  });

  it("gives a curated egg the four EU grades", async () => {
    await seedCuratedFoods();

    const [food] = await searchStandardFoods("egg boiled", "whole");

    expect(food.portions.map((portion) => portion.label)).toEqual([
      "small",
      "medium",
      "large",
      "extra large",
    ]);
  });

  it("leaves a food with no portion class empty", async () => {
    await seedCuratedFoods();

    const [food] = await searchStandardFoods("chicken breast raw", "whole");

    expect(food.portions).toEqual([]);
  });

  it("name-matches a user product the OCR named as a bread", async () => {
    const userId = await seedUser();
    mockAuth.mockResolvedValue({ user: { id: userId } });
    const { productId } = await createProduct({
      name: "Zito Bread Toast",
      nutritionPer100g: { energyKcal: 270, fatG: 3.3, saturatesG: 0.7, carbohydrateG: 49, sugarsG: 5, proteinG: 8.8, saltG: 1.2 },
    });

    const candidates = await searchUserProducts("zito bread");

    const match = candidates.find((candidate) => candidate.id === productId);
    expect(match?.portions).toEqual([
      { label: "slice", grams: 28 },
      { label: "slice, large", grams: 38 },
    ]);
  });
});
