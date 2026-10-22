const mockAuth = vi.fn();
vi.mock("@/auth", () => ({ auth: () => mockAuth() }));

import { eq, sql } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { db } from "@/lib/db";
import { AI_ESTIMATE_ORIGIN, products, users } from "@/lib/db/schema";

import { linkBarcode } from "./barcode";
import { setPortionGrams } from "./portions";
import {
  attachLabelProof,
  createProduct,
  findStoredMeasures,
  getProductForCorrection,
  matchProduct,
  saveNutritionOverride,
  searchUserProducts,
} from "./products";

export const FIGURES = {
  energyKcal: "165",
  fatG: "3.6",
  saturatesG: "1.0",
  carbohydrateG: "0",
  sugarsG: "0",
  proteinG: "31",
  saltG: "0.2",
  fibreG: "0",
};

export const seedUser = async (): Promise<string> => {
  const [user] = await db.insert(users).values({ email: `ai-${crypto.randomUUID()}@example.com` }).returning();
  return user.id;
};

export const seedAiProduct = async (userId: string, name = "Chicken breast"): Promise<string> => {
  const [row] = await db
    .insert(products)
    .values({ name, nameSearch: name.toLowerCase(), ...FIGURES, nutritionOrigin: AI_ESTIMATE_ORIGIN, createdByUserId: userId })
    .returning({ id: products.id });
  return row.id;
};

export const signedInAs = (userId: string) => mockAuth.mockResolvedValue({ user: { id: userId } });

// drizzle wraps the pg error: its own message is the failed query, and the
// constraint name lives on the cause. Asserting on the message would pass for
// any failed insert, including one no constraint refused.
const violatedConstraint = async (insert: Promise<unknown>): Promise<string | undefined> => {
  try {
    await insert;
  } catch (error) {
    const cause = (error as { cause?: { constraint?: string } }).cause;
    return cause?.constraint;
  }
  return undefined;
};

beforeEach(async () => {
  mockAuth.mockReset();
  await db.execute(sql`TRUNCATE TABLE product_barcodes, portion_overrides, product_overrides, products, "user" CASCADE`);
});

describe("products_ai_estimate_private", () => {
  it("accepts a private AI row", async () => {
    const userId = await seedUser();
    await expect(seedAiProduct(userId)).resolves.toEqual(expect.any(String));
  });

  it("refuses an AI row carrying a label photo", async () => {
    const userId = await seedUser();
    expect(
      await violatedConstraint(
        db.insert(products).values({
          name: "Chicken breast",
          nameSearch: "chicken breast",
          ...FIGURES,
          nutritionOrigin: AI_ESTIMATE_ORIGIN,
          nutritionPhotoKey: `test/${crypto.randomUUID()}.jpg`,
          createdByUserId: userId,
        }),
      ),
    ).toBe("products_ai_estimate_private");
  });

  it("refuses an AI row marked standard", async () => {
    const userId = await seedUser();
    expect(
      await violatedConstraint(
        db.insert(products).values({
          name: "Chicken breast",
          nameSearch: "chicken breast",
          ...FIGURES,
          source: "standard",
          nutritionOrigin: AI_ESTIMATE_ORIGIN,
          createdByUserId: userId,
        }),
      ),
    ).toBe("products_ai_estimate_private");
  });
});

const NUTRITION = {
  energyKcal: 165, fatG: 3.6, saturatesG: 1.0, carbohydrateG: 0, sugarsG: 0, proteinG: 31, saltG: 0.2, fibreG: 0,
};

describe("AI rows stay out of every search, match and gate", () => {
  it("searchUserProducts never returns an AI row, even to its author", async () => {
    const userId = await seedUser();
    await seedAiProduct(userId);
    signedInAs(userId);
    expect(await searchUserProducts("chicken")).toEqual([]);
  });

  it("matchProduct never matches an AI row", async () => {
    const userId = await seedUser();
    await seedAiProduct(userId);
    signedInAs(userId);
    expect(await matchProduct("Chicken breast")).toEqual({ kind: "no_match" });
  });

  it("findSameFigures ignores an AI row with identical figures", async () => {
    const userId = await seedUser();
    await seedAiProduct(userId);
    signedInAs(userId);
    const result = await createProduct({ name: "Chicken breast", nutritionPer100g: NUTRITION, nutritionOrigin: "manual" });
    expect(result.kind).toBe("created");
  });

  it("saveNutritionOverride refuses an AI row", async () => {
    const userId = await seedUser();
    const productId = await seedAiProduct(userId);
    signedInAs(userId);
    await expect(saveNutritionOverride(productId, NUTRITION)).rejects.toThrow("is not an editable user product");
  });

  it("linkBarcode refuses an AI row", async () => {
    const userId = await seedUser();
    const productId = await seedAiProduct(userId);
    signedInAs(userId);
    await expect(linkBarcode("5901234123457", productId)).rejects.toThrow("is an AI estimate");
  });

  it("setPortionGrams refuses an AI row", async () => {
    const userId = await seedUser();
    const productId = await seedAiProduct(userId);
    signedInAs(userId);
    await expect(setPortionGrams(productId, "slice", 30)).rejects.toThrow("is an AI estimate");
  });

  it("another user never sees an AI row", async () => {
    const author = await seedUser();
    const other = await seedUser();
    await seedAiProduct(author);
    signedInAs(other);
    expect(await searchUserProducts("chicken")).toEqual([]);
  });

  // A same-name AI row could win findStoredMeasures's
  // `ORDER BY p.id LIMIT 1` tiebreak and mask a real row's learned serving
  // weight. Explicit ids force the AI row to sort first without the fence.
  it("findStoredMeasures ignores an AI row that would otherwise win the id tiebreak", async () => {
    const userId = await seedUser();
    const name = "Chicken breast";
    await db.insert(products).values({
      id: "00000000-0000-0000-0000-000000000002",
      name,
      nameSearch: name.toLowerCase(),
      ...FIGURES,
      servingUnit: "breast",
      servingGrams: "120",
      createdByUserId: userId,
    });
    await db.insert(products).values({
      id: "00000000-0000-0000-0000-000000000001",
      name,
      nameSearch: name.toLowerCase(),
      ...FIGURES,
      nutritionOrigin: AI_ESTIMATE_ORIGIN,
      createdByUserId: userId,
    });
    signedInAs(userId);
    expect(await findStoredMeasures(name)).toEqual({ densityGMl: null, servingUnit: "breast", servingGrams: 120 });
  });

  // An AI row is otherwise indistinguishable from a hand-typed proofless row,
  // so without this exclusion attachLabelProof would promote a guess to a
  // shared, label-proved product.
  it("attachLabelProof refuses an AI row and leaves it untouched", async () => {
    const userId = await seedUser();
    const productId = await seedAiProduct(userId);
    signedInAs(userId);
    const photo = new Blob(["proof-jpeg-bytes"], { type: "image/jpeg" });

    const result = await attachLabelProof(productId, photo, { nutritionPer100g: NUTRITION, fromLabel: true });

    expect(result).toEqual({ kind: "not_attachable" });
    const [row] = await db.select().from(products).where(eq(products.id, productId));
    expect(row.nutritionOrigin).toBe(AI_ESTIMATE_ORIGIN);
    expect(row.nutritionPhotoKey).toBeNull();
  });

  it("getProductForCorrection returns null for an AI row, so its page 404s", async () => {
    const userId = await seedUser();
    const productId = await seedAiProduct(userId);
    signedInAs(userId);

    expect(await getProductForCorrection(productId)).toBeNull();
  });
});
