const mockAuth = vi.fn();
vi.mock("@/auth", () => ({ auth: () => mockAuth() }));

import { sql } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { db } from "@/lib/db";
import { products, users } from "@/lib/db/schema";

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
    .values({ name, nameSearch: name.toLowerCase(), ...FIGURES, nutritionOrigin: "ai_estimate", createdByUserId: userId })
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
          nutritionOrigin: "ai_estimate",
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
          nutritionOrigin: "ai_estimate",
          createdByUserId: userId,
        }),
      ),
    ).toBe("products_ai_estimate_private");
  });
});
