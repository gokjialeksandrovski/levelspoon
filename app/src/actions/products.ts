"use server";

import { randomUUID } from "node:crypto";

import { eq, sql } from "drizzle-orm";

import { requireUserId } from "@/lib/auth/require-user";
import { db } from "@/lib/db";
import { products } from "@/lib/db/schema";
import { NOTHING_LEARNED, type LearnedMeasures } from "@/lib/measures/learn";
import { getPhotoUrl, uploadPhoto } from "@/lib/s3";

// Spec §1's margin rule: an absolute-threshold-only rule would let two
// nutritionally-different product variants (e.g. "2% Fat" vs "10% Fat")
// silently take the no-confirm fast path, since trigram similarity alone
// cannot distinguish a few-character variant difference. Requiring a
// margin between the top two candidates routes exactly these collisions
// into the ambiguous path instead.
const CONFIDENT_SIMILARITY_THRESHOLD = 0.65;
const CONFIDENT_MARGIN = 0.15;
const AMBIGUOUS_SIMILARITY_THRESHOLD = 0.35;
const CANDIDATE_LIMIT = 5;

export interface NutritionValues {
  energyKcal: number;
  fatG: number;
  saturatesG: number;
  carbohydrateG: number;
  sugarsG: number;
  proteinG: number;
  saltG: number;
}

export interface ProductCandidate {
  id: string;
  name: string;
  brand: string | null;
  nutritionPer100g: NutritionValues;
  nutritionPhotoKey: string;
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
  nutrition_photo_key: string;
  score: number;
};

const toProductCandidate = (row: CandidateRow): ProductCandidate => ({
  id: row.id,
  name: row.name,
  brand: row.brand,
  nutritionPer100g: {
    energyKcal: Number(row.energy_kcal),
    fatG: Number(row.fat_g),
    saturatesG: Number(row.saturates_g),
    carbohydrateG: Number(row.carbohydrate_g),
    sugarsG: Number(row.sugars_g),
    proteinG: Number(row.protein_g),
    saltG: Number(row.salt_g),
  },
  nutritionPhotoKey: row.nutrition_photo_key,
});

const isConfidentMatch = (top1Score: number, top2Score: number): boolean =>
  top1Score >= CONFIDENT_SIMILARITY_THRESHOLD && top1Score - top2Score >= CONFIDENT_MARGIN;

const isRelevantScore = (row: CandidateRow): boolean =>
  Number(row.score) >= AMBIGUOUS_SIMILARITY_THRESHOLD;

export const topTwoScores = (rows: CandidateRow[]): { top1: number; top2: number } => ({
  top1: Number(rows[0].score),
  top2: rows.length > 1 ? Number(rows[1].score) : 0,
});

const fetchCandidateRows = async (ocrText: string): Promise<CandidateRow[]> => {
  const result = await db.execute<CandidateRow>(sql`
    SELECT id, name, brand, energy_kcal, fat_g, saturates_g, carbohydrate_g,
           sugars_g, protein_g, salt_g, nutrition_photo_key,
           similarity(name, ${ocrText}) AS score
    FROM products
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

  const { top1, top2 } = topTwoScores(rows);

  if (isConfidentMatch(top1, top2)) {
    return {
      kind: "confident",
      product: toProductCandidate(rows[0]),
      alternatives: rows.slice(1).filter(isRelevantScore).map(toProductCandidate),
    };
  }
  if (top1 >= AMBIGUOUS_SIMILARITY_THRESHOLD) {
    return { kind: "ambiguous", candidates: rows.filter(isRelevantScore).map(toProductCandidate) };
  }
  return { kind: "no_match" };
};

export interface CreateProductInput {
  name: string;
  nutritionPer100g: NutritionValues;
  photo: Blob;
  /** What the label or the user taught about this product's measurements. */
  learned?: LearnedMeasures;
}

const uploadProductPhoto = async (photo: Blob): Promise<string> => {
  const extension = photo.type === "image/png" ? "png" : "jpg";
  const photoKey = `products/${randomUUID()}.${extension}`;
  const buffer = Buffer.from(await photo.arrayBuffer());
  await uploadPhoto(photoKey, buffer, photo.type);
  return photoKey;
};

// Shared with updateProduct's photo branch (and the reverse mapping in
// getProductForCorrection) so the per100g <-> numeric-column conversion
// lives in exactly one place.
const toNutritionColumns = (values: NutritionValues) => ({
  energyKcal: String(values.energyKcal),
  fatG: String(values.fatG),
  saturatesG: String(values.saturatesG),
  carbohydrateG: String(values.carbohydrateG),
  sugarsG: String(values.sugarsG),
  proteinG: String(values.proteinG),
  saltG: String(values.saltG),
});

// Drizzle's numeric columns round-trip as strings, so a learned value is
// stringified on the way in and parsed on the way out - the same treatment
// the seven nutrition columns already get.
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

export const createProduct = async (
  input: CreateProductInput,
): Promise<{ productId: string }> => {
  const userId = await requireUserId();
  const photoKey = await uploadProductPhoto(input.photo);

  const [row] = await db
    .insert(products)
    .values({
      name: input.name,
      ...toNutritionColumns(input.nutritionPer100g),
      ...toLearnedColumns(input.learned ?? NOTHING_LEARNED),
      nutritionPhotoKey: photoKey,
      createdByUserId: userId,
    })
    .returning({ id: products.id });

  return { productId: row.id };
};

export interface UpdateProductInput {
  name?: string;
  nutritionPer100g: NutritionValues;
  photo?: Blob;
}

export const updateProduct = async (
  productId: string,
  updates: UpdateProductInput,
): Promise<void> => {
  const userId = await requireUserId();
  // Replacing a photo leaves the old R2/MinIO object as an orphan (never
  // deleted) - an accepted simplification, consistent with the master
  // spec's existing risk-acceptance style (spec §4.2).
  const photoKey = updates.photo ? await uploadProductPhoto(updates.photo) : undefined;

  await db
    .update(products)
    .set({
      ...(updates.name !== undefined ? { name: updates.name } : {}),
      ...toNutritionColumns(updates.nutritionPer100g),
      ...(photoKey ? { nutritionPhotoKey: photoKey } : {}),
      updatedByUserId: userId,
      updatedAt: new Date(),
    })
    .where(eq(products.id, productId));
};

export interface ProductForCorrection {
  id: string;
  name: string;
  nutritionPer100g: NutritionValues;
  photoUrl: string | null; // null only when getPhotoUrl itself failed - degrade, don't block
}

export const getProductForCorrection = async (productId: string): Promise<ProductForCorrection | null> => {
  await requireUserId();
  const [product] = await db.select().from(products).where(eq(products.id, productId));
  if (!product) {
    return null;
  }

  const photoUrl = await getPhotoUrl(product.nutritionPhotoKey).catch(() => null);
  return {
    id: product.id,
    name: product.name,
    nutritionPer100g: fromNutritionColumns(product),
    photoUrl,
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
 * Deliberately an exact match (case/whitespace-normalized), not a fuzzy one:
 * this is called from the wizard's nutrition-photo step, reachable after the
 * user has already rejected a screen of trigram-similar candidates ("None of
 * these"). Reusing matchProduct's similarity floor here would happily
 * re-match one of those just-rejected products and silently hand back ITS
 * learned serving weight for a different product - exactly the cross-product
 * density borrowing this pipeline's global constraint forbids. An exact match
 * still serves the real target scenario (re-scanning the same product, whose
 * name was confirmed and saved verbatim last time), while a near-miss now
 * safely falls through to NOTHING_LEARNED and the caller asks the user
 * instead of guessing.
 */
export const findStoredMeasures = async (productName: string): Promise<LearnedMeasures> => {
  await requireUserId();
  const result = await db.execute<StoredMeasuresRow>(sql`
    SELECT density_g_ml, serving_unit, serving_grams
    FROM products
    WHERE lower(trim(name)) = lower(trim(${productName}))
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
