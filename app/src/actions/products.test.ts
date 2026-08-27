import { eq, sql } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";

import { db } from "@/lib/db";
import { products, users } from "@/lib/db/schema";

import { createProduct, matchProduct } from "./products";

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
});

describe("matchProduct", () => {
  it("returns a confident match for a near-exact name with no close competitor", async () => {
    const userId = await seedUser();
    await seedProduct(userId, "Olympus Greek Yogurt 2% Fat");

    const result = await matchProduct("Olympus Greek Yogurt 2 Fat");

    expect(result.kind).toBe("confident");
  });

  it("routes the 2%-vs-10% variant pair to ambiguous, not confident", async () => {
    // The margin rule's entire reason for existing (spec §1): two variants
    // score far above the confident threshold against each other despite
    // being nutritionally different. This must never take the no-confirm
    // fast path.
    //
    // The query text deliberately omits the fat-percentage digits/symbol -
    // this mirrors a realistic OCR read that captured the words but missed
    // the specific number (exactly the kind of drop the M1 OCR milestone's
    // real photo exhibited), and is what actually produces a close margin
    // between the two variants. An OCR text that happens to be an EXACT
    // match to one variant's full name (e.g. "...2% Fat" verbatim) scores
    // 1.0 against it and only ~0.83 against the other - a 0.167 margin,
    // which clears CONFIDENT_MARGIN and would (correctly, by the rule's own
    // logic) return confident, not ambiguous. That isn't a bug in the
    // matching logic; it's just not the scenario this test is meant to
    // exercise, so the query text must not be an exact match to either
    // seeded name.
    //
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
  it("writes a new product with the uploaded photo's key", async () => {
    const userId = await seedUser();

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
      photo: { buffer: Buffer.from("fake-jpeg-bytes"), contentType: "image/jpeg" },
      userId,
    });

    const [row] = await db.select().from(products).where(eq(products.id, productId));
    expect(row.name).toBe("Fresh Milk 3.2%");
    expect(row.nutritionPhotoKey).toMatch(/^products\/.+/);
  });
});
