"use server";

import { randomUUID } from "node:crypto";

import { eq, sql } from "drizzle-orm";

import { db } from "@/lib/db";
import { products } from "@/lib/db/schema";
import { uploadPhoto } from "@/lib/s3";

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
  | { kind: "confident"; product: ProductCandidate }
  | { kind: "ambiguous"; candidates: ProductCandidate[] }
  | { kind: "no_match" };

// Extends Record<string, unknown> (rather than declaring plain fields) so it
// satisfies db.execute<TRow extends Record<string, unknown>>'s generic
// constraint - a plain interface with only fixed properties doesn't
// structurally satisfy that bound without this.
interface CandidateRow extends Record<string, unknown> {
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
}

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

export const matchProduct = async (ocrText: string): Promise<MatchResult> => {
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
    return { kind: "confident", product: toProductCandidate(rows[0]) };
  }
  if (top1Score >= AMBIGUOUS_SIMILARITY_THRESHOLD) {
    return { kind: "ambiguous", candidates: rows.map(toProductCandidate) };
  }
  return { kind: "no_match" };
};

export interface CreateProductInput {
  name: string;
  nutritionPer100g: NutritionValues;
  photo: { buffer: Buffer; contentType: string };
  userId: string;
}

export const createProduct = async (
  input: CreateProductInput,
): Promise<{ productId: string }> => {
  const extension = input.photo.contentType === "image/png" ? "png" : "jpg";
  const photoKey = `products/${randomUUID()}.${extension}`;

  await uploadPhoto(photoKey, input.photo.buffer, input.photo.contentType);

  const [row] = await db
    .insert(products)
    .values({
      name: input.name,
      energyKcal: String(input.nutritionPer100g.energyKcal),
      fatG: String(input.nutritionPer100g.fatG),
      saturatesG: String(input.nutritionPer100g.saturatesG),
      carbohydrateG: String(input.nutritionPer100g.carbohydrateG),
      sugarsG: String(input.nutritionPer100g.sugarsG),
      proteinG: String(input.nutritionPer100g.proteinG),
      saltG: String(input.nutritionPer100g.saltG),
      nutritionPhotoKey: photoKey,
      createdByUserId: input.userId,
    })
    .returning({ id: products.id });

  return { productId: row.id };
};

export interface UpdateProductInput {
  nutritionPer100g: NutritionValues;
  userId: string;
}

export const updateProduct = async (
  productId: string,
  updates: UpdateProductInput,
): Promise<void> => {
  await db
    .update(products)
    .set({
      energyKcal: String(updates.nutritionPer100g.energyKcal),
      fatG: String(updates.nutritionPer100g.fatG),
      saturatesG: String(updates.nutritionPer100g.saturatesG),
      carbohydrateG: String(updates.nutritionPer100g.carbohydrateG),
      sugarsG: String(updates.nutritionPer100g.sugarsG),
      proteinG: String(updates.nutritionPer100g.proteinG),
      saltG: String(updates.nutritionPer100g.saltG),
      updatedByUserId: updates.userId,
      updatedAt: new Date(),
    })
    .where(eq(products.id, productId));
};
