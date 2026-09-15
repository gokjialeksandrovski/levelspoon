"use server";

import { randomUUID } from "node:crypto";

import { and, eq, sql } from "drizzle-orm";

import { requireUserId } from "@/lib/auth/require-user";
import { toCanonicalBarcode } from "@/lib/barcode/normalize";
import { db } from "@/lib/db";
import { products, productBarcodes, productSource } from "@/lib/db/schema";
import { NOTHING_LEARNED, type LearnedMeasures } from "@/lib/measures/learn";
import { getPhotoUrl, uploadPhoto } from "@/lib/s3";
import type { NutritionValues } from "@/types/nutrition";

import { BarcodeAlreadyLinkedError, ProductNotEditableError } from "./products.errors";

// Spec §1's margin rule: absolute-threshold-only would let nutritionally-
// different variants (e.g. "2% Fat" vs "10% Fat") take the no-confirm path,
// since trigram similarity alone can't separate them. The margin catches it.
const CONFIDENT_SIMILARITY_THRESHOLD = 0.65;
const CONFIDENT_MARGIN = 0.15;
const AMBIGUOUS_SIMILARITY_THRESHOLD = 0.35;
const CANDIDATE_LIMIT = 5;

// productSource.enumValues is the tuple ["user", "standard"].
const STANDARD_SOURCE = productSource.enumValues[1];
const USER_SOURCE = productSource.enumValues[0];

export interface ProductCandidate {
  id: string;
  name: string;
  brand: string | null;
  nutritionPer100g: NutritionValues;
  // Null on standard rows and on any barcode-created row with no label
  // photo (OFF-sourced products never had one taken).
  nutritionPhotoKey: string | null;
  densityGMl: number | null;
  servingUnit: string | null;
  servingGrams: number | null;
  nutritionBasisUnit: string;
}

export type MatchResult =
  | { kind: "confident"; product: ProductCandidate; alternatives: ProductCandidate[] }
  | { kind: "ambiguous"; candidates: ProductCandidate[] }
  | { kind: "no_match" };

export type CandidateRow = {
  id: string;
  name: string;
  brand: string | null;
  energy_kcal: string;
  fat_g: string;
  saturates_g: string;
  carbohydrate_g: string;
  sugars_g: string;
  protein_g: string;
  salt_g: string;
  nutrition_photo_key: string | null;
  density_g_ml: string | null;
  serving_unit: string | null;
  serving_grams: string | null;
  nutrition_basis_unit: string;
  score: number;
};

type SnakeNutritionRow = {
  energy_kcal: string;
  fat_g: string;
  saturates_g: string;
  carbohydrate_g: string;
  sugars_g: string;
  protein_g: string;
  salt_g: string;
};

const nutritionFromSnakeRow = (row: SnakeNutritionRow): NutritionValues => ({
  energyKcal: Number(row.energy_kcal),
  fatG: Number(row.fat_g),
  saturatesG: Number(row.saturates_g),
  carbohydrateG: Number(row.carbohydrate_g),
  sugarsG: Number(row.sugars_g),
  proteinG: Number(row.protein_g),
  saltG: Number(row.salt_g),
});

export const toProductCandidate = async (row: Omit<CandidateRow, "score">): Promise<ProductCandidate> => {
  await requireUserId();
  return {
    id: row.id,
    name: row.name,
    brand: row.brand,
    nutritionPer100g: nutritionFromSnakeRow(row),
    nutritionPhotoKey: row.nutrition_photo_key,
    densityGMl: row.density_g_ml === null ? null : Number(row.density_g_ml),
    servingUnit: row.serving_unit,
    servingGrams: row.serving_grams === null ? null : Number(row.serving_grams),
    nutritionBasisUnit: row.nutrition_basis_unit,
  };
};

const isConfidentMatch = (top1Score: number, top2Score: number): boolean =>
  top1Score >= CONFIDENT_SIMILARITY_THRESHOLD && top1Score - top2Score >= CONFIDENT_MARGIN;

const isRelevantScore = (row: CandidateRow): boolean =>
  Number(row.score) >= AMBIGUOUS_SIMILARITY_THRESHOLD;

// Every export from a "use server" file is independently reachable as its
// own Server Action, so this checks auth itself rather than trusting
// matchProduct's caller to have done it.
export const topTwoScores = async (rows: CandidateRow[]): Promise<{ top1: number; top2: number }> => {
  await requireUserId();
  return { top1: Number(rows[0].score), top2: rows.length > 1 ? Number(rows[1].score) : 0 };
};

const fetchCandidateRows = async (ocrText: string): Promise<CandidateRow[]> => {
  const result = await db.execute<CandidateRow>(sql`
    SELECT id, name, brand, energy_kcal, fat_g, saturates_g, carbohydrate_g,
           sugars_g, protein_g, salt_g, nutrition_photo_key,
           density_g_ml, serving_unit, serving_grams,
           nutrition_basis_unit,
           similarity(name, ${ocrText}) AS score
    FROM products
    WHERE source = ${USER_SOURCE}
    ORDER BY score DESC
    LIMIT ${CANDIDATE_LIMIT}
  `);
  return result.rows;
};

export const matchProduct = async (ocrText: string): Promise<MatchResult> => {
  await requireUserId();
  const rows = await fetchCandidateRows(ocrText);

  if (rows.length === 0) {
    return { kind: "no_match" };
  }

  const { top1, top2 } = await topTwoScores(rows);

  if (isConfidentMatch(top1, top2)) {
    return {
      kind: "confident",
      product: await toProductCandidate(rows[0]),
      alternatives: await Promise.all(rows.slice(1).filter(isRelevantScore).map(toProductCandidate)),
    };
  }
  if (top1 >= AMBIGUOUS_SIMILARITY_THRESHOLD) {
    return { kind: "ambiguous", candidates: await Promise.all(rows.filter(isRelevantScore).map(toProductCandidate)) };
  }
  return { kind: "no_match" };
};

export interface CreateProductInput {
  name: string;
  nutritionPer100g: NutritionValues;
  photo?: Blob;
  /** What the label or the user taught about this product's measurements. */
  learned?: LearnedMeasures;
  /** The product's storage basis - omitted for the default per-100g
   * product, set by the capture pipeline's per-unit fallback (spec §5). */
  nutritionBasisUnit?: string;
  nutritionBasisQuantity?: number;
  /** Set only by the barcode-scan capture path - attached to the new
   * product's row in the same transaction as its creation (barcode spec §4). */
  barcode?: string;
  /** Omitted defaults to "label_photo" via the column's own DB default. */
  nutritionOrigin?: "label_photo" | "manual" | "open_food_facts";
}

const uploadProductPhoto = async (photo: Blob): Promise<string> => {
  const extension = photo.type === "image/png" ? "png" : "jpg";
  const photoKey = `products/${randomUUID()}.${extension}`;
  const buffer = Buffer.from(await photo.arrayBuffer());
  await uploadPhoto(photoKey, buffer, photo.type);
  return photoKey;
};

// Shared with updateProduct's photo branch and getProductForCorrection's
// reverse mapping, so the per100g<->numeric-column conversion is one place.
const toNutritionColumns = (values: NutritionValues) => ({
  energyKcal: String(values.energyKcal),
  fatG: String(values.fatG),
  saturatesG: String(values.saturatesG),
  carbohydrateG: String(values.carbohydrateG),
  sugarsG: String(values.sugarsG),
  proteinG: String(values.proteinG),
  saltG: String(values.saltG),
});

// Drizzle's numeric columns round-trip as strings: stringified going in,
// parsed coming out - same treatment the seven nutrition columns get.
const toLearnedColumns = (learned: LearnedMeasures) => ({
  densityGMl: learned.densityGMl === null ? null : String(learned.densityGMl),
  servingUnit: learned.servingUnit,
  servingGrams: learned.servingGrams === null ? null : String(learned.servingGrams),
});

const fromNutritionColumns = (row: typeof products.$inferSelect): NutritionValues => ({
  energyKcal: Number(row.energyKcal),
  fatG: Number(row.fatG),
  saturatesG: Number(row.saturatesG),
  carbohydrateG: Number(row.carbohydrateG),
  sugarsG: Number(row.sugarsG),
  proteinG: Number(row.proteinG),
  saltG: Number(row.saltG),
});

const DEFAULT_NUTRITION_BASIS_UNIT = "g";
const DEFAULT_NUTRITION_BASIS_QUANTITY = 100;

const toProductInsertValues = (input: CreateProductInput, userId: string, photoKey: string | null) => ({
  name: input.name,
  ...toNutritionColumns(input.nutritionPer100g),
  ...toLearnedColumns(input.learned ?? NOTHING_LEARNED),
  nutritionBasisUnit: input.nutritionBasisUnit ?? DEFAULT_NUTRITION_BASIS_UNIT,
  nutritionBasisQuantity: String(input.nutritionBasisQuantity ?? DEFAULT_NUTRITION_BASIS_QUANTITY),
  nutritionPhotoKey: photoKey,
  createdByUserId: userId,
  ...(input.nutritionOrigin ? { nutritionOrigin: input.nutritionOrigin } : {}),
});

const UNIQUE_VIOLATION = "23505";

// Drizzle wraps the driver's error in a `cause` property; matches barcode.ts's
// isUniqueViolation exactly. Duplicated rather than imported because barcode.ts
// already imports from this file - sharing it would close a cycle.
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

const insertBarcodeLink = async (link: () => Promise<unknown>, barcode: string): Promise<void> => {
  try {
    await link();
  } catch (error) {
    if (!isUniqueViolation(error)) {
      throw error;
    }
    throw new BarcodeAlreadyLinkedError(barcode);
  }
};

export const createProduct = async (
  input: CreateProductInput,
): Promise<{ productId: string }> => {
  const userId = await requireUserId();
  // Before the upload: a rejected barcode must not leave an orphaned photo.
  const barcode = input.barcode ? toCanonicalBarcode(input.barcode) : null;
  const photoKey = input.photo ? await uploadProductPhoto(input.photo) : null;

  return db.transaction(async (tx) => {
    const [row] = await tx
      .insert(products)
      .values(toProductInsertValues(input, userId, photoKey))
      .returning({ id: products.id });

    if (barcode) {
      const values = { barcode, productId: row.id, createdByUserId: userId };
      await insertBarcodeLink(() => tx.insert(productBarcodes).values(values), barcode);
    }
    return { productId: row.id };
  });
};

export interface UpdateProductInput {
  name?: string;
  nutritionPer100g: NutritionValues;
  photo?: Blob;
}

const assertUpdated = (updated: { id: string }[], productId: string): void => {
  if (updated.length === 0) {
    throw new ProductNotEditableError(productId);
  }
};

export const updateProduct = async (
  productId: string,
  updates: UpdateProductInput,
): Promise<void> => {
  const userId = await requireUserId();
  // Replacing a photo leaves the old R2/MinIO object as an orphan (never
  // deleted) - an accepted simplification, consistent with the master
  // spec's existing risk-acceptance style (spec §4.2).
  const photoKey = updates.photo ? await uploadProductPhoto(updates.photo) : undefined;

  // A standard row (curated, no owner) must never be silently overwritten via
  // a guessed id (spec §2). Scoping WHERE to source='user' and failing loudly
  // on a zero-row update catches both a standard-row id and a nonexistent one.
  const updated = await db
    .update(products)
    .set({
      ...(updates.name !== undefined ? { name: updates.name } : {}),
      ...toNutritionColumns(updates.nutritionPer100g),
      ...(photoKey ? { nutritionPhotoKey: photoKey } : {}),
      updatedByUserId: userId,
      updatedAt: new Date(),
    })
    .where(and(eq(products.id, productId), eq(products.source, USER_SOURCE)))
    .returning({ id: products.id });

  assertUpdated(updated, productId);
};

export interface ProductForCorrection {
  id: string;
  name: string;
  nutritionPer100g: NutritionValues;
  photoUrl: string | null; // null only when getPhotoUrl itself failed - degrade, don't block
  nutritionBasisUnit: string;
  nutritionBasisQuantity: number;
}

export const getProductForCorrection = async (productId: string): Promise<ProductForCorrection | null> => {
  await requireUserId();
  const [product] = await db.select().from(products).where(eq(products.id, productId));
  // A standard row has no label photo and no "Values look wrong?" path — it is
  // curated, not user-owned. (spec §6)
  if (!product || product.source === STANDARD_SOURCE) {
    return null;
  }

  const photoUrl = product.nutritionPhotoKey
    ? await getPhotoUrl(product.nutritionPhotoKey).catch(() => null)
    : null;
  return {
    id: product.id,
    name: product.name,
    nutritionPer100g: fromNutritionColumns(product),
    photoUrl,
    nutritionBasisUnit: product.nutritionBasisUnit,
    nutritionBasisQuantity: Number(product.nutritionBasisQuantity),
  };
};

type StoredMeasuresRow = {
  density_g_ml: string | null;
  serving_unit: string | null;
  serving_grams: string | null;
};

const toNumberOrNull = (value: string | null): number | null =>
  value === null ? null : Number(value);

/**
 * What a previously-saved product of the SAME name already taught us.
 *
 * Exact match (case/whitespace-normalized), not fuzzy: called after the user
 * has already rejected a screen of trigram-similar candidates ("None of
 * these"), so reusing matchProduct's similarity floor would re-match one of
 * those rejected products and hand back its learned serving weight - the
 * cross-product borrowing this pipeline forbids. A near-miss falls through
 * to NOTHING_LEARNED and the caller asks the user instead of guessing.
 */
export const findStoredMeasures = async (productName: string): Promise<LearnedMeasures> => {
  await requireUserId();
  // source = user only: a standard row (USDA "Egg", "Banana") sharing a name
  // must never lend its learned serving weight to an OCR'd label (spec §10, §6).
  const result = await db.execute<StoredMeasuresRow>(sql`
    SELECT density_g_ml, serving_unit, serving_grams
    FROM products
    WHERE lower(trim(name)) = lower(trim(${productName}))
      AND source = ${USER_SOURCE}
    ORDER BY id
    LIMIT 1
  `);
  const [row] = result.rows;
  if (!row) {
    return NOTHING_LEARNED;
  }
  return {
    densityGMl: toNumberOrNull(row.density_g_ml),
    servingUnit: row.serving_unit,
    servingGrams: toNumberOrNull(row.serving_grams),
  };
};

export interface StandardFood {
  id: string;
  slug: string;
  name: string;
  category: "whole" | "fat";
  nutritionPer100g: NutritionValues;
  servingUnit: string | null;
  servingGrams: number | null;
  densityGMl: number | null;
  nutritionBasisUnit: string;
}

type StandardFoodRow = SnakeNutritionRow & {
  id: string;
  standard_slug: string;
  name: string;
  standard_category: "whole" | "fat";
  serving_unit: string | null;
  serving_grams: string | null;
  density_g_ml: string | null;
  nutrition_basis_unit: string;
  score: number;
};

const STANDARD_SEARCH_LIMIT = 8;
// Low floor: a pick list, not the shared-cache write path, so the margin
// rule (spec §6) doesn't apply - just high enough to filter no-hope queries.
const STANDARD_SEARCH_MIN_SIMILARITY = 0.15;

const toStandardFood = (row: StandardFoodRow): StandardFood => ({
  id: row.id,
  slug: row.standard_slug,
  name: row.name,
  category: row.standard_category,
  nutritionPer100g: nutritionFromSnakeRow(row),
  servingUnit: row.serving_unit,
  servingGrams: row.serving_grams === null ? null : Number(row.serving_grams),
  densityGMl: row.density_g_ml === null ? null : Number(row.density_g_ml),
  nutritionBasisUnit: row.nutrition_basis_unit,
});

const fetchStandardFoodRows = async (
  query: string,
  category?: "whole" | "fat",
): Promise<StandardFoodRow[]> => {
  const categoryFilter = category ? sql`AND standard_category = ${category}` : sql``;
  const result = await db.execute<StandardFoodRow>(sql`
    SELECT id, standard_slug, name, standard_category,
           energy_kcal, fat_g, saturates_g, carbohydrate_g, sugars_g, protein_g, salt_g,
           serving_unit, serving_grams, density_g_ml, nutrition_basis_unit, score
    FROM (
      SELECT *, similarity(lower(name), lower(${query})) AS score
      FROM products
      WHERE source = ${STANDARD_SOURCE} ${categoryFilter}
    ) ranked
    WHERE score >= ${STANDARD_SEARCH_MIN_SIMILARITY}
    ORDER BY score DESC, name ASC
    LIMIT ${STANDARD_SEARCH_LIMIT}
  `);
  return result.rows;
};

export const searchStandardFoods = async (
  query: string,
  category?: "whole" | "fat",
): Promise<StandardFood[]> => {
  await requireUserId();
  const rows = await fetchStandardFoodRows(query, category);
  return rows.map(toStandardFood);
};
