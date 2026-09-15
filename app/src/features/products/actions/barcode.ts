"use server";

import { sql } from "drizzle-orm";

import { requireUserId } from "@/lib/auth/require-user";
import { normalizeBarcode } from "@/lib/barcode/normalize";
import type { BarcodeLookupProvider } from "@/lib/barcode/lookup-provider";
import { MockBarcodeLookupProvider } from "@/lib/barcode/mock-lookup-provider";
import { OpenFoodFactsProvider } from "@/lib/barcode/open-food-facts-provider";
import { db } from "@/lib/db";
import { productBarcodes } from "@/lib/db/schema";
import type { NutritionValues } from "@/types/nutrition";

import { validateNutrition } from "./ocr";
import { toProductCandidate, type CandidateRow, type ProductCandidate } from "./products";

export type LookupBarcodeResult =
  | { kind: "internal_match"; product: ProductCandidate }
  | {
      kind: "external_match";
      barcode: string;
      nameGuess: string;
      nutritionPer100g: NutritionValues;
      nutritionBasisUnit: string;
      netWeightText: string | null;
      flags: string[];
    }
  | { kind: "not_found"; barcode: string }
  | { kind: "rejected" };

export type LinkBarcodeResult =
  | { kind: "linked" }
  | { kind: "already_linked_elsewhere"; product: ProductCandidate };

const UNIQUE_VIOLATION = "23505";

// Drizzle wraps the driver's error in a `cause` property; matches auth.ts's
// isUniqueViolation exactly. Not shared into a lib/ helper yet - two small
// occurrences, extract on a third (YAGNI).
const isUniqueViolation = (error: unknown): boolean => {
  if (typeof error !== "object" || error === null) {
    return false;
  }
  if ("code" in error && (error as { code: unknown }).code === UNIQUE_VIOLATION) {
    return true;
  }
  const cause = (error as { cause?: unknown }).cause;
  return (
    typeof cause === "object" &&
    cause !== null &&
    "code" in cause &&
    (cause as { code: unknown }).code === UNIQUE_VIOLATION
  );
};

type BarcodeMatchRow = Omit<CandidateRow, "score">;

const fetchProductByBarcode = async (barcode: string): Promise<BarcodeMatchRow | null> => {
  const result = await db.execute<BarcodeMatchRow>(sql`
    SELECT p.id, p.name, p.brand, p.energy_kcal, p.fat_g, p.saturates_g, p.carbohydrate_g,
           p.sugars_g, p.protein_g, p.salt_g, p.nutrition_photo_key, p.density_g_ml,
           p.serving_unit, p.serving_grams, p.nutrition_basis_unit
    FROM product_barcodes b
    JOIN products p ON p.id = b.product_id
    WHERE b.barcode = ${barcode}
  `);
  return result.rows[0] ?? null;
};

const getLookupProvider = (): BarcodeLookupProvider =>
  process.env.BARCODE_LOOKUP_PROVIDER === "mock" ? new MockBarcodeLookupProvider() : new OpenFoodFactsProvider();

export const lookupBarcode = async (rawCode: string): Promise<LookupBarcodeResult> => {
  await requireUserId();
  const normalized = normalizeBarcode(rawCode);
  if (normalized.kind !== "ok") {
    return { kind: "rejected" };
  }
  const { barcode } = normalized;

  const internalRow = await fetchProductByBarcode(barcode);
  if (internalRow) {
    return { kind: "internal_match", product: await toProductCandidate(internalRow) };
  }

  const external = await getLookupProvider().lookup(barcode);
  if (external.kind === "not_found") {
    return { kind: "not_found", barcode };
  }
  const { flags } = await validateNutrition(external.match.nutritionPer100g);
  return { kind: "external_match", barcode, flags, ...external.match };
};

export const linkBarcode = async (barcode: string, productId: string): Promise<LinkBarcodeResult> => {
  const userId = await requireUserId();
  try {
    await db.insert(productBarcodes).values({ barcode, productId, createdByUserId: userId });
    return { kind: "linked" };
  } catch (error) {
    if (!isUniqueViolation(error)) {
      throw error;
    }
    const existing = await fetchProductByBarcode(barcode);
    if (!existing) {
      throw error;
    }
    return { kind: "already_linked_elsewhere", product: await toProductCandidate(existing) };
  }
};
