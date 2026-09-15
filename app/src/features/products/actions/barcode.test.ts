import { eq, sql } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.stubEnv("BARCODE_LOOKUP_PROVIDER", "mock");
vi.stubEnv("OCR_PROVIDER", "mock");

const mockAuth = vi.fn();
vi.mock("@/auth", () => ({ auth: () => mockAuth() }));

import { db } from "@/lib/db";
import { productBarcodes, products, users } from "@/lib/db/schema";
import { MOCK_NOT_FOUND_BARCODE } from "@/lib/barcode/mock-lookup-provider";
import { InvalidBarcodeError } from "@/lib/barcode/normalize";

import { linkBarcode, lookupBarcode } from "./barcode";

const EXISTING_BARCODE = "5901234123457";
const EXTERNAL_HIT_BARCODE = "4000000000006";
const RESTRICTED_BARCODE = "2012345678903";
const FRESH_LINK_BARCODE = "1111111111116";
const ALREADY_BOUND_BARCODE = "0012345678905";

const seedUser = async (): Promise<string> => {
  const [user] = await db.insert(users).values({ email: `test-${crypto.randomUUID()}@example.com` }).returning();
  return user.id;
};

const seedProduct = async (userId: string, name: string): Promise<string> => {
  const [product] = await db
    .insert(products)
    .values({
      name,
      energyKcal: "70", fatG: "2.0", saturatesG: "1.2", carbohydrateG: "4.0",
      sugarsG: "4.0", proteinG: "9.0", saltG: "0.18",
      nutritionPhotoKey: "test/placeholder.jpg",
      createdByUserId: userId,
    })
    .returning({ id: products.id });
  return product.id;
};

beforeEach(async () => {
  await db.execute(sql`TRUNCATE TABLE product_barcodes, products, meal_ingredients, meals CASCADE`);
  mockAuth.mockReset();
});

describe("lookupBarcode", () => {
  it("returns internal_match for a barcode already linked to a product", async () => {
    const userId = await seedUser();
    const productId = await seedProduct(userId, "Olympus Greek Yogurt 2% Fat");
    await db.insert(productBarcodes).values({ barcode: EXISTING_BARCODE, productId, createdByUserId: userId });
    mockAuth.mockResolvedValue({ user: { id: userId } });

    const result = await lookupBarcode(EXISTING_BARCODE);

    expect(result.kind).toBe("internal_match");
    if (result.kind === "internal_match") {
      expect(result.product.id).toBe(productId);
    }
  });

  it("returns external_match with validated flags on an internal miss + mock OFF hit", async () => {
    const userId = await seedUser();
    mockAuth.mockResolvedValue({ user: { id: userId } });

    const result = await lookupBarcode(EXTERNAL_HIT_BARCODE);

    expect(result).toEqual({
      kind: "external_match",
      barcode: EXTERNAL_HIT_BARCODE,
      nameGuess: "Mock Product",
      nutritionPer100g: { energyKcal: 250, fatG: 10, saturatesG: 3, carbohydrateG: 30, sugarsG: 12, proteinG: 6, saltG: 0.5 },
      nutritionBasisUnit: "g",
      netWeightText: "250 g",
      flags: [],
    });
  });

  it("returns not_found on a double miss (internal and external)", async () => {
    const userId = await seedUser();
    mockAuth.mockResolvedValue({ user: { id: userId } });

    const result = await lookupBarcode(MOCK_NOT_FOUND_BARCODE);

    expect(result).toEqual({ kind: "not_found", barcode: MOCK_NOT_FOUND_BARCODE });
  });

  it("rejects a restricted-circulation code before any query", async () => {
    const userId = await seedUser();
    mockAuth.mockResolvedValue({ user: { id: userId } });

    const result = await lookupBarcode(RESTRICTED_BARCODE);

    expect(result).toEqual({ kind: "rejected" });
  });

  it("throws when there is no authenticated session", async () => {
    mockAuth.mockResolvedValue(null);

    await expect(lookupBarcode(EXISTING_BARCODE)).rejects.toThrow();
  });
});

describe("linkBarcode", () => {
  it("links a fresh barcode to a product", async () => {
    const userId = await seedUser();
    const productId = await seedProduct(userId, "Test Cereal");
    mockAuth.mockResolvedValue({ user: { id: userId } });

    const result = await linkBarcode(FRESH_LINK_BARCODE, productId);

    expect(result).toEqual({ kind: "linked" });
    const [row] = await db.select().from(productBarcodes).where(eq(productBarcodes.barcode, FRESH_LINK_BARCODE));
    expect(row.productId).toBe(productId);
  });

  it("returns already_linked_elsewhere, never throws, when the barcode is already bound", async () => {
    const userId = await seedUser();
    const ownerProductId = await seedProduct(userId, "Original Owner Product");
    await db.insert(productBarcodes).values({ barcode: ALREADY_BOUND_BARCODE, productId: ownerProductId, createdByUserId: userId });
    const otherProductId = await seedProduct(userId, "A Different Product");
    mockAuth.mockResolvedValue({ user: { id: userId } });

    const result = await linkBarcode(ALREADY_BOUND_BARCODE, otherProductId);

    expect(result.kind).toBe("already_linked_elsewhere");
    if (result.kind === "already_linked_elsewhere") {
      expect(result.product.id).toBe(ownerProductId);
    }
  });

  it("stores a valid 12-digit UPC-A in its canonical EAN-13 form", async () => {
    const userId = await seedUser();
    const productId = await seedProduct(userId, "Canonical Form Product");
    mockAuth.mockResolvedValue({ user: { id: userId } });

    await linkBarcode("012345678905", productId);

    const [row] = await db.select().from(productBarcodes).where(eq(productBarcodes.barcode, ALREADY_BOUND_BARCODE));
    expect(row.productId).toBe(productId);
  });

  it("refuses a restricted-circulation barcode instead of writing it to the shared table", async () => {
    const userId = await seedUser();
    const productId = await seedProduct(userId, "Test Cereal");
    mockAuth.mockResolvedValue({ user: { id: userId } });

    await expect(linkBarcode(RESTRICTED_BARCODE, productId)).rejects.toThrow(InvalidBarcodeError);
    expect(await db.select().from(productBarcodes)).toEqual([]);
  });

  it("refuses a bad check digit instead of writing it to the shared table", async () => {
    const userId = await seedUser();
    const productId = await seedProduct(userId, "Test Cereal");
    mockAuth.mockResolvedValue({ user: { id: userId } });

    await expect(linkBarcode("5901234123458", productId)).rejects.toThrow(InvalidBarcodeError);
    expect(await db.select().from(productBarcodes)).toEqual([]);
  });

  it("throws when there is no authenticated session", async () => {
    mockAuth.mockResolvedValue(null);

    await expect(linkBarcode(FRESH_LINK_BARCODE, "00000000-0000-0000-0000-000000000000")).rejects.toThrow();
  });
});
