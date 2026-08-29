"use server";

import { randomUUID } from "node:crypto";

import { eq, sql } from "drizzle-orm";

import { requireUserId } from "@/lib/auth/require-user";
import { db } from "@/lib/db";
import { products } from "@/lib/db/schema";
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

type CandidateRow = {
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

export const matchProduct = async (ocrText: string): Promise<MatchResult> => {
  await requireUserId();
  const result = await db.execute<CandidateRow>(sql`
    SELECT id, name, brand, energy_kcal, fat_g, saturates_g, carbohydrate_g,
           sugars_g, protein_g, salt_g, nutrition_photo_key,
           similarity(name, ${ocrText}) AS score
    FROM products
    ORDER BY score DESC
    LIMIT ${CANDIDATE_LIMIT}
  `);
  const rows = result.rows;

  if (rows.length === 0) {
    return { kind: "no_match" };
  }

  const top1Score = Number(rows[0].score);
  const top2Score = rows.length > 1 ? Number(rows[1].score) : 0;

  if (isConfidentMatch(top1Score, top2Score)) {
    return {
      kind: "confident",
      product: toProductCandidate(rows[0]),
      alternatives: rows.slice(1).filter(isRelevantScore).map(toProductCandidate),
    };
  }
  if (top1Score >= AMBIGUOUS_SIMILARITY_THRESHOLD) {
    return { kind: "ambiguous", candidates: rows.filter(isRelevantScore).map(toProductCandidate) };
  }
  return { kind: "no_match" };
};

export interface CreateProductInput {
  name: string;
  nutritionPer100g: NutritionValues;
  photo: Blob;
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
