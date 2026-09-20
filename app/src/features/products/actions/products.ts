"use server";

import { and, eq, sql } from "drizzle-orm";

import { requireUserId } from "@/lib/auth/require-user";
import { toCanonicalBarcode } from "@/lib/barcode/normalize";
import { db } from "@/lib/db";
import { toLikeTokens } from "@/lib/db/like-tokens";
import {
  CLAIM_PHOTO_PREFIX,
  extensionFromBytes,
  photoKeysFor,
  PROOF_PHOTO_PREFIX,
  toPhotoKey,
} from "@/lib/db/photo-keys";
import { findPhotoOwner } from "@/lib/db/photo-owner";
import { toSearchText } from "@/lib/db/search-text";
import { effectiveNutritionSql, overrideJoinSql } from "@/lib/db/effective-nutrition";
import { portionOverridesJson } from "@/lib/db/portion-overrides-sql";
import { products, productBarcodes, productOverrides, productSource } from "@/lib/db/schema";
import { visibleToUser } from "@/lib/db/visibility";
import { NOTHING_LEARNED, type LearnedMeasures } from "@/lib/measures/learn";
import type { Portion } from "@/lib/measures/portions";
import { resolvePortions } from "@/lib/measures/resolve-portions";
import { deletePhoto, uploadPhoto } from "@/lib/s3";
import type { NutritionValues } from "@/types/nutrition";

import {
  BarcodeAlreadyLinkedError,
  DuplicateProductError,
  LabelPhotoAlreadyUsedError,
  ProductNotEditableError,
  SameFiguresError,
} from "./products.errors";

// Spec §1's margin rule: absolute-threshold-only would let nutritionally-
// different variants (e.g. "2% Fat" vs "10% Fat") take the no-confirm path,
// since trigram similarity alone can't separate them. The margin catches it.
const CONFIDENT_SIMILARITY_THRESHOLD = 0.65;
const CONFIDENT_MARGIN = 0.15;
const AMBIGUOUS_SIMILARITY_THRESHOLD = 0.35;
const CANDIDATE_LIMIT = 5;
// A pick list, not the shared-cache write path, so the margin rule (§1) does
// not apply here - the user picks the row, nothing auto-accepts. Same limit
// as searchStandardFoods so both pick lists fill one phone screen.
const TYPED_SEARCH_LIMIT = 8;
// A romanization is a spelling, not the spelling: "сирење" is "sirenje" by the
// book and "sirene" to whoever typed it. So a typed query matches on tokens or
// on looking close enough as a whole - measured against local Postgres,
// similarity('sirenje', 'sirene') is 0.5, and an unrelated pair of product
// names lands well under this floor.
const TYPED_SEARCH_MIN_SIMILARITY = 0.3;

// productSource.enumValues is the tuple ["user", "standard"].
const STANDARD_SOURCE = productSource.enumValues[1];
const USER_SOURCE = productSource.enumValues[0];

export interface ProductCandidate {
  id: string;
  name: string;
  brand: string | null;
  /** Household portions this user should see, already merged with their own
   * overrides. Resolved server-side so `portions.ts` never reaches the
   * browser bundle. */
  portions: readonly Portion[];
  nutritionPer100g: NutritionValues;
  // Null on standard rows and on any barcode-created row with no label
  // photo (OFF-sourced products never had one taken).
  nutritionPhotoKey: string | null;
  densityGMl: number | null;
  servingUnit: string | null;
  servingGrams: number | null;
  nutritionBasisUnit: string;
  /** What the nutrition figures above are stated per - 100 for a per-100g
   * product, 1 for a per-unit one. Needed client-side to scale a typed
   * amount into a live contribution preview. */
  nutritionBasisQuantity: number;
}

export type MatchResult =
  | { kind: "confident"; product: ProductCandidate; alternatives: ProductCandidate[] }
  | { kind: "ambiguous"; candidates: ProductCandidate[] }
  | { kind: "no_match" };

export type CandidateRow = {
  id: string;
  name: string;
  brand: string | null;
  name_search: string;
  standard_slug: string | null;
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
  nutrition_basis_quantity: string;
  portion_overrides: Record<string, string>;
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
  const portions = resolvePortions({
    standardSlug: row.standard_slug,
    nameSearch: row.name_search,
    servingUnit: row.serving_unit,
    servingGrams: row.serving_grams === null ? null : Number(row.serving_grams),
    nutritionBasisUnit: row.nutrition_basis_unit,
    overrides: Object.fromEntries(
      Object.entries(row.portion_overrides).map(([label, grams]) => [label, Number(grams)]),
    ),
  });
  return {
    id: row.id,
    name: row.name,
    brand: row.brand,
    portions,
    nutritionPer100g: nutritionFromSnakeRow(row),
    nutritionPhotoKey: row.nutrition_photo_key,
    densityGMl: row.density_g_ml === null ? null : Number(row.density_g_ml),
    servingUnit: row.serving_unit,
    servingGrams: row.serving_grams === null ? null : Number(row.serving_grams),
    nutritionBasisUnit: row.nutrition_basis_unit,
    nutritionBasisQuantity: Number(row.nutrition_basis_quantity),
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

const NUTRITION_FIELDS = [
  "energyKcal",
  "fatG",
  "saturatesG",
  "carbohydrateG",
  "sugarsG",
  "proteinG",
  "saltG",
] as const satisfies readonly (keyof NutritionValues)[];

interface ComparableNutrition {
  nutrition: NutritionValues;
  basisUnit: string;
  basisQuantity: number;
}

// Exact equality, not a tolerance: both sides came off the same printed label,
// so a real duplicate matches digit for digit. A tolerance would start merging
// products that genuinely differ by a gram.
const hasSameFigures = (left: ComparableNutrition, right: ComparableNutrition): boolean =>
  left.basisUnit === right.basisUnit &&
  left.basisQuantity === right.basisQuantity &&
  NUTRITION_FIELDS.every((field) => left.nutrition[field] === right.nutrition[field]);

export type DuplicateVerdict =
  | { kind: "insert" }
  | { kind: "same-product" }
  | { kind: "same-figures" };

/**
 * Whether these figures are a product per100 already stores.
 *
 * Byte-identical photo keys catch a reused file; this catches the same label
 * re-photographed from another angle, which hashes differently but parses to
 * the same seven values (spec §5).
 *
 * Name similarity only picks the tier, it is not a condition: "candy bar"
 * scores ~0 against "Bella Farm YOGHURT 2,8% m.m", and that is exactly the
 * case worth catching. Below the floor the figures may still collide honestly -
 * every brand of water is 0 across the board - so that tier asks rather than
 * refuses.
 */
export const decideDuplicate = async (
  candidate: ComparableNutrition & { nameSimilarity: number },
  existing: ComparableNutrition | null,
): Promise<DuplicateVerdict> => {
  await requireUserId();
  if (!existing || !hasSameFigures(candidate, existing)) {
    return { kind: "insert" };
  }
  return candidate.nameSimilarity >= AMBIGUOUS_SIMILARITY_THRESHOLD
    ? { kind: "same-product" }
    : { kind: "same-figures" };
};

interface FiguresMatch {
  id: string;
  name: string;
  visible: boolean;
  nameSimilarity: number;
  existing: ComparableNutrition;
}

// Every user row, visibility ignored: a private row is still a real product, so
// a collision with it is still a collision. Visibility decides only whether the
// user is told which product it was. The WHERE clause does the figure equality
// itself (rather than through decideDuplicate) so the probe stays one indexed
// round trip; decideDuplicate still decides the tier below.
//
// Scores name_search, not the raw name - CLAUDE.md's "typed search compares
// romanized text, never raw names" carves out exactly one exception
// (matchProduct, tuned on OCR strings); this probe is a second comparison and
// belongs under the same rule, or a Cyrillic stored name versus its
// Latin-typed duplicate scores ~0 and a genuine collision quietly degrades to
// tier 2's ask.
const findSameFigures = async (
  input: CreateProductInput,
  userId: string,
): Promise<FiguresMatch | null> => {
  const values = toNutritionColumns(input.nutritionPer100g);
  const { basisUnit, basisQuantity } = basisOf(input);
  const result = await db.execute<
    SnakeNutritionRow & {
      id: string;
      name: string;
      visible: boolean;
      nutrition_basis_unit: string;
      nutrition_basis_quantity: string;
      score: number;
    }
  >(sql`
    SELECT p.id, p.name, (${visibleToUser(userId)}) AS visible,
           p.energy_kcal, p.fat_g, p.saturates_g, p.carbohydrate_g, p.sugars_g, p.protein_g, p.salt_g,
           p.nutrition_basis_unit, p.nutrition_basis_quantity,
           similarity(p.name_search, ${toSearchText(input.name)}) AS score
    FROM products p
    WHERE p.source = ${USER_SOURCE}
      AND p.energy_kcal = ${values.energyKcal}
      AND p.fat_g = ${values.fatG}
      AND p.saturates_g = ${values.saturatesG}
      AND p.carbohydrate_g = ${values.carbohydrateG}
      AND p.sugars_g = ${values.sugarsG}
      AND p.protein_g = ${values.proteinG}
      AND p.salt_g = ${values.saltG}
      AND p.nutrition_basis_unit = ${basisUnit}
      AND p.nutrition_basis_quantity = ${String(basisQuantity)}
    ORDER BY score DESC
    LIMIT 1
  `);
  const row = result.rows[0];
  return row
    ? {
        id: row.id,
        name: row.name,
        visible: row.visible,
        nameSimilarity: Number(row.score),
        existing: {
          nutrition: nutritionFromSnakeRow(row),
          basisUnit: row.nutrition_basis_unit,
          basisQuantity: Number(row.nutrition_basis_quantity),
        },
      }
    : null;
};

// decideDuplicate is the tested statement of the tier rule; this only finds
// the colliding row and acts on the verdict. A same-product match the user
// cannot see degrades to the same-figures tier - there is nothing to offer
// them without naming a row they cannot see.
//
// Tier 1 is acknowledgeable too, not just tier 2. Two brands of bottled water
// ("Jana Natural Mineral Water" / "Rosa Natural Mineral Water") or one brand's
// dried pasta shapes sharing a per-100g table score well above
// AMBIGUOUS_SIMILARITY_THRESHOLD on name alone while being genuinely different
// products, and water is not among the curated standard foods - a hard block
// with no escape made the second brand permanently unfileable, and the only
// workaround (nudge a figure by 0.1) writes false nutrition into the shared
// cache, the exact corruption this gate exists to prevent. "Use X instead"
// stays the primary action offered for this tier; the checkbox is the escape
// for the honest collision, same as tier 2's.
const assertNotDuplicate = async (input: CreateProductInput, userId: string): Promise<void> => {
  const match = await findSameFigures(input, userId);
  if (!match) {
    return;
  }
  const candidate = { nutrition: input.nutritionPer100g, ...basisOf(input), nameSimilarity: match.nameSimilarity };
  const verdict = await decideDuplicate(candidate, match.existing);
  if (verdict.kind === "insert") {
    return;
  }
  if (verdict.kind === "same-product" && match.visible && !input.acknowledgedSameFigures) {
    throw new DuplicateProductError({ id: match.id, name: match.name });
  }
  if (input.acknowledgedSameFigures) {
    return;
  }
  throw new SameFiguresError(match.visible ? match.name : null);
};

const fetchCandidateRows = async (ocrText: string, userId: string): Promise<CandidateRow[]> => {
  const result = await db.execute<CandidateRow>(sql`
    SELECT p.id, p.name, p.brand, p.name_search, p.standard_slug, ${effectiveNutritionSql("p", "o")},
           p.nutrition_photo_key, p.density_g_ml, p.serving_unit, p.serving_grams,
           p.nutrition_basis_unit, p.nutrition_basis_quantity,
           ${portionOverridesJson("p", userId)},
           similarity(p.name, ${ocrText}) AS score
    FROM products p
    ${overrideJoinSql("p", "o", userId)}
    WHERE p.source = ${USER_SOURCE}
      AND ${visibleToUser(userId)}
    ORDER BY score DESC
    LIMIT ${CANDIDATE_LIMIT}
  `);
  return result.rows;
};

export const matchProduct = async (ocrText: string): Promise<MatchResult> => {
  const userId = await requireUserId();
  const rows = await fetchCandidateRows(ocrText, userId);

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

/**
 * Typed-name search over the user-contributed products.
 *
 * Every token must appear somewhere in the name (ILIKE) - or, for a query whose
 * spelling drifted from the stored one, the whole query must score at least
 * TYPED_SEARCH_MIN_SIMILARITY against it. Both sides are compared in their
 * romanized form (toSearchText), so a name in any script is reachable from a
 * Latin keyboard. Ranked by whole-string trigram similarity so the closest name
 * still sorts first. Deliberately NOT
 * matchProduct: that one scores the whole OCR string and owns the confident/
 * ambiguous margin that guards the shared cache. Typing "bella" scores ~0.1
 * against "Bella Farm YOGHURT 2,8% m.m 1kr/kg", below the 0.35 floor - correct
 * for an OCR string, useless for a keyword.
 *
 * source = 'user' only: standard rows have their own picker (searchStandardFoods)
 * and a typed search is for packaged products.
 */
export const searchUserProducts = async (query: string): Promise<ProductCandidate[]> => {
  const userId = await requireUserId();
  const searchQuery = toSearchText(query);
  const tokens = toLikeTokens(searchQuery);
  if (tokens.length === 0) {
    return [];
  }

  const tokenFilters = tokens.map((token) => sql`p.name_search ILIKE ${`%${token}%`}`);
  const result = await db.execute<CandidateRow>(sql`
    SELECT p.id, p.name, p.brand, p.name_search, p.standard_slug, ${effectiveNutritionSql("p", "o")},
           p.nutrition_photo_key, p.density_g_ml, p.serving_unit, p.serving_grams,
           p.nutrition_basis_unit, p.nutrition_basis_quantity,
           ${portionOverridesJson("p", userId)},
           similarity(p.name_search, ${searchQuery}) AS score
    FROM products p
    ${overrideJoinSql("p", "o", userId)}
    WHERE p.source = ${USER_SOURCE}
      AND ${visibleToUser(userId)}
      AND (${sql.join(tokenFilters, sql` AND `)}
           OR similarity(p.name_search, ${searchQuery}) >= ${TYPED_SEARCH_MIN_SIMILARITY})
    ORDER BY score DESC, name ASC
    LIMIT ${TYPED_SEARCH_LIMIT}
  `);
  return Promise.all(result.rows.map(toProductCandidate));
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
  /** Set only after the user was shown SameFiguresError and said the figures
   * collide honestly (two brands of water read identically). Never defaulted. */
  acknowledgedSameFigures?: true;
}

interface PendingPhoto {
  key: string;
  buffer: Buffer;
  contentType: string;
}

// Hashed before any upload so a refusal (borrowed photo, duplicate product)
// leaves no orphaned object - the same ordering the barcode check already uses.
// The key's extension comes from the bytes (extensionFromBytes), never from
// photo.type - contentType still carries the declared MIME type, which stays
// correct for the upload's content-type header, just not for the key.
const toPendingPhoto = async (photo: Blob, prefix: string): Promise<PendingPhoto> => {
  const buffer = Buffer.from(await photo.arrayBuffer());
  return { key: toPhotoKey(buffer, prefix, extensionFromBytes(buffer)), buffer, contentType: photo.type };
};

const putPendingPhoto = async (pending: PendingPhoto): Promise<string> => {
  await uploadPhoto(pending.key, pending.buffer, pending.contentType);
  return pending.key;
};

// Identical bytes hash to two different keys under the two prefixes, so a
// forgery can hide on either side: a photo already filed as one product's
// proof must not become another's claim, and vice versa. Both forms are
// derived from the same buffer and probed together. `exemptKey` lets
// saveNutritionOverride pass the claim it is about to supersede - re-saving
// your own claim on the same product is not a forgery.
const assertPhotoUnused = async (
  pending: PendingPhoto,
  userId: string,
  exemptKey?: string | null,
): Promise<void> => {
  const { proofKey, claimKey } = photoKeysFor(pending.buffer);
  // At most one of the two forms can ever equal exemptKey - they carry
  // different prefixes - so this never empties the array; a guard for that
  // would misstate the prefix invariant rather than protect anything.
  const keys = [proofKey, claimKey].filter((key) => key !== exemptKey);
  const owner = await findPhotoOwner(keys, userId);
  if (owner) {
    throw new LabelPhotoAlreadyUsedError(owner.name);
  }
};

// Shared by createProduct and saveNutritionOverride, so the per100g<->numeric-
// column conversion is one place.
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

// The default-filling pair was inlined at three call sites (findSameFigures,
// assertNotDuplicate, here) - one helper so the default lives in one place.
const basisOf = (input: CreateProductInput): { basisUnit: string; basisQuantity: number } => ({
  basisUnit: input.nutritionBasisUnit ?? DEFAULT_NUTRITION_BASIS_UNIT,
  basisQuantity: input.nutritionBasisQuantity ?? DEFAULT_NUTRITION_BASIS_QUANTITY,
});

const toProductInsertValues = (input: CreateProductInput, userId: string, photoKey: string | null) => {
  const { basisUnit, basisQuantity } = basisOf(input);
  return {
    name: input.name,
    nameSearch: toSearchText(input.name),
    ...toNutritionColumns(input.nutritionPer100g),
    ...toLearnedColumns(input.learned ?? NOTHING_LEARNED),
    nutritionBasisUnit: basisUnit,
    nutritionBasisQuantity: String(basisQuantity),
    nutritionPhotoKey: photoKey,
    createdByUserId: userId,
    ...(input.nutritionOrigin ? { nutritionOrigin: input.nutritionOrigin } : {}),
  };
};

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

/**
 * `createProduct`'s outcome, as data rather than a throw.
 *
 * A Server Action's thrown error does not survive the trip back to a client
 * component with its subclass identity or its own properties intact - only a
 * generic `Error` carrying `name`/`message`/`digest` crosses that boundary
 * (`barcode.ts`'s `LookupBarcodeResult`/`already_linked_elsewhere` already
 * established this pattern for the same reason). `assertNotDuplicate` and
 * `insertBarcodeLink` below still throw their named errors - `instanceof`
 * stays reliable there because it never leaves this module - and this
 * function is what catches each one at its own boundary and maps it here.
 */
export type CreateProductResult =
  | { kind: "created"; productId: string; portions: readonly Portion[] }
  | { kind: "duplicate_product"; product: { id: string; name: string } }
  | { kind: "same_figures"; ownerName: string | null }
  | { kind: "barcode_conflict" };

// assertNotDuplicate's two refusal tiers, mapped to CreateProductResult; any
// other throw (e.g. an actual DB failure) is not this function's to interpret
// and propagates unchanged.
const duplicateResult = async (
  input: CreateProductInput,
  userId: string,
): Promise<CreateProductResult | null> => {
  try {
    await assertNotDuplicate(input, userId);
    return null;
  } catch (error) {
    if (error instanceof DuplicateProductError) {
      return { kind: "duplicate_product", product: error.product };
    }
    if (error instanceof SameFiguresError) {
      return { kind: "same_figures", ownerName: error.ownerName };
    }
    throw error;
  }
};

const insertProductRow = async (
  input: CreateProductInput,
  userId: string,
  photoKey: string | null,
  barcode: string | null,
): Promise<CreateProductResult> => {
  try {
    return await db.transaction(async (tx) => {
      const [row] = await tx
        .insert(products)
        .values(toProductInsertValues(input, userId, photoKey))
        .returning({ id: products.id });

      if (barcode) {
        const values = { barcode, productId: row.id, createdByUserId: userId };
        await insertBarcodeLink(() => tx.insert(productBarcodes).values(values), barcode);
      }
      // Returned rather than refetched: the confirm step hands this straight to
      // the amount step, and being a client component it cannot resolve portions
      // itself without pulling the gram table into the browser bundle.
      const values = toProductInsertValues(input, userId, photoKey);
      return {
        kind: "created",
        productId: row.id,
        portions: resolvePortions({
          standardSlug: null,
          nameSearch: values.nameSearch,
          servingUnit: values.servingUnit,
          servingGrams: values.servingGrams === null ? null : Number(values.servingGrams),
          nutritionBasisUnit: values.nutritionBasisUnit,
          overrides: {},
        }),
      };
    });
  } catch (error) {
    if (error instanceof BarcodeAlreadyLinkedError) {
      return { kind: "barcode_conflict" };
    }
    throw error;
  }
};

export const createProduct = async (input: CreateProductInput): Promise<CreateProductResult> => {
  const userId = await requireUserId();
  // Before the upload: a rejected barcode or duplicate must not leave an
  // orphaned photo.
  const barcode = input.barcode ? toCanonicalBarcode(input.barcode) : null;

  const duplicate = await duplicateResult(input, userId);
  if (duplicate) {
    return duplicate;
  }

  const pendingPhoto = input.photo ? await toPendingPhoto(input.photo, PROOF_PHOTO_PREFIX) : null;
  if (pendingPhoto) {
    await assertPhotoUnused(pendingPhoto, userId);
  }
  const photoKey = pendingPhoto ? await putPendingPhoto(pendingPhoto) : null;

  return insertProductRow(input, userId, photoKey, barcode);
};

const assertUpdated = (updated: { id: string }[], productId: string): void => {
  if (updated.length === 0) {
    throw new ProductNotEditableError(productId);
  }
};

// Gates the override write path on the same rule the reads use, so a
// private product's UUID can't be used to write a claim photo into the
// photo-debt queue nobody but its author can see the product to review.
// Raw SQL, not Drizzle, so visibleToUser's `p`-aliased fragment can inline
// directly rather than needing a second, duplicated predicate.
const assertUserProduct = async (userId: string, productId: string): Promise<void> => {
  const result = await db.execute<{ id: string }>(sql`
    SELECT p.id FROM products p
    WHERE p.id = ${productId}
      AND p.source = ${USER_SOURCE}
      AND ${visibleToUser(userId)}
  `);
  if (result.rows.length === 0) {
    throw new ProductNotEditableError(productId);
  }
};

const fetchOverridePhotoKey = async (userId: string, productId: string): Promise<string | null> => {
  const [row] = await db
    .select({ nutritionPhotoKey: productOverrides.nutritionPhotoKey })
    .from(productOverrides)
    .where(and(eq(productOverrides.userId, userId), eq(productOverrides.productId, productId)));
  return row?.nutritionPhotoKey ?? null;
};

/**
 * `saveNutritionOverride`'s outcome, as data rather than a throw - the same
 * reason `createProduct` returns `CreateProductResult` instead of letting
 * `LabelPhotoAlreadyUsedError` cross the Server Action boundary. This is the
 * write path's other photo-key mint site; it went without this for a while
 * because only createProduct had an earlier good path (the nutrition step's
 * own probe) to fall back on - this path has none, so a caller that only
 * catches never sees which refusal happened.
 */
export type SaveNutritionOverrideResult =
  | { kind: "saved" }
  | { kind: "photo_already_used"; ownerName: string | null };

/**
 * One user's correction to one product, written to product_overrides rather
 * than onto the shared row.
 *
 * Before this, a correction rewrote the canonical figures for every user and,
 * because meal_ingredients stores no nutrition snapshot, retroactively rewrote
 * every past meal that referenced the product. The upsert's ON CONFLICT is what
 * keeps exactly one live correction per (user, product): a second edit replaces
 * the first rather than accumulating rows nothing reads.
 *
 * The photo is optional and independent of the figures. Omitting it leaves any
 * photo already attached in place - "I corrected a typo" must not silently
 * withdraw "the label changed" - while supplying one replaces the previous
 * claim and deletes the object it replaced.
 */
export const saveNutritionOverride = async (
  productId: string,
  nutritionPer100g: NutritionValues,
  photo?: Blob,
): Promise<SaveNutritionOverrideResult> => {
  const userId = await requireUserId();
  await assertUserProduct(userId, productId);

  const supersededPhotoKey = photo ? await fetchOverridePhotoKey(userId, productId) : null;
  // Uploaded before the write so a storage failure leaves no row claiming a
  // key that does not exist - the same ordering createProduct uses.
  const pendingPhoto = photo ? await toPendingPhoto(photo, CLAIM_PHOTO_PREFIX) : null;
  if (pendingPhoto) {
    try {
      await assertPhotoUnused(pendingPhoto, userId, supersededPhotoKey);
    } catch (error) {
      if (error instanceof LabelPhotoAlreadyUsedError) {
        return { kind: "photo_already_used", ownerName: error.ownerName };
      }
      throw error;
    }
  }
  const photoColumn = pendingPhoto ? { nutritionPhotoKey: await putPendingPhoto(pendingPhoto) } : {};
  const columns = toNutritionColumns(nutritionPer100g);

  await db
    .insert(productOverrides)
    .values({ userId, productId, ...columns, ...photoColumn })
    .onConflictDoUpdate({
      target: [productOverrides.userId, productOverrides.productId],
      set: { ...columns, ...photoColumn, updatedAt: new Date() },
    });

  // A content-addressed key means re-saving the same file supersedes itself -
  // deleting then removes the object the surviving row points at.
  if (supersededPhotoKey && supersededPhotoKey !== pendingPhoto?.key) {
    await deletePhoto(supersededPhotoKey);
  }

  return { kind: "saved" };
};

/** "Use the original values" - drops this user's correction, leaving the
 * canonical label-photo row as what they see again. A no-op when there is
 * nothing to clear: the button is idempotent by design, and a double tap is
 * not an error worth surfacing.
 *
 * A withdrawn claim leaves nothing to review, so its photo goes with the row -
 * otherwise reverting is how the bucket fills with objects nothing references. */
export const clearNutritionOverride = async (productId: string): Promise<void> => {
  const userId = await requireUserId();
  const [removed] = await db
    .delete(productOverrides)
    .where(and(eq(productOverrides.userId, userId), eq(productOverrides.productId, productId)))
    .returning({ nutritionPhotoKey: productOverrides.nutritionPhotoKey });

  if (removed?.nutritionPhotoKey) {
    await deletePhoto(removed.nutritionPhotoKey);
  }
};

/** A name still lives on the shared row, so only its author may change it -
 * an OCR typo is the author's to fix, not everyone's to overwrite. */
export const renameOwnProduct = async (productId: string, name: string): Promise<void> => {
  const userId = await requireUserId();
  const updated = await db
    .update(products)
    .set({ name, nameSearch: toSearchText(name), updatedByUserId: userId, updatedAt: new Date() })
    .where(
      and(
        eq(products.id, productId),
        eq(products.source, USER_SOURCE),
        eq(products.createdByUserId, userId),
      ),
    )
    .returning({ id: products.id });

  assertUpdated(updated, productId);
};

export interface ProductForCorrection {
  id: string;
  name: string;
  /** What this user sees today - their own correction if they have one. */
  nutritionPer100g: NutritionValues;
  /** The canonical label-photo figures, so the screen can offer a revert. */
  originalNutritionPer100g: NutritionValues;
  hasOverride: boolean;
  /** Whether this user already offered a photo of a changed label. Drives the
   * disclosure's copy - the photo itself is not shown back (spec §Not building). */
  hasOverridePhoto: boolean;
  /** A name lives on the shared row, so only its author may change it. */
  canRename: boolean;
  nutritionBasisUnit: string;
  nutritionBasisQuantity: number;
  /** The stored proof key. The page resolves it to a signed URL; this action
   * stays free of S3 so it can be unit-tested against Postgres alone. */
  nutritionPhotoKey: string | null;
}

type OverrideNutritionRow = SnakeNutritionRow & { nutrition_photo_key: string | null };

const fetchOverrideRow = async (userId: string, productId: string): Promise<OverrideNutritionRow | null> => {
  const [row] = await db
    .select({
      energy_kcal: productOverrides.energyKcal,
      fat_g: productOverrides.fatG,
      saturates_g: productOverrides.saturatesG,
      carbohydrate_g: productOverrides.carbohydrateG,
      sugars_g: productOverrides.sugarsG,
      protein_g: productOverrides.proteinG,
      salt_g: productOverrides.saltG,
      nutrition_photo_key: productOverrides.nutritionPhotoKey,
    })
    .from(productOverrides)
    .where(and(eq(productOverrides.userId, userId), eq(productOverrides.productId, productId)));
  return row ?? null;
};

// A standard row is curated, not user-owned: no label photo, no correction
// path. (spec §6)
export const getProductForCorrection = async (productId: string): Promise<ProductForCorrection | null> => {
  const userId = await requireUserId();
  const [product] = await db.select().from(products).where(eq(products.id, productId));
  if (!product || product.source === STANDARD_SOURCE) {
    return null;
  }

  const override = await fetchOverrideRow(userId, productId);
  const original = fromNutritionColumns(product);

  return {
    id: product.id,
    name: product.name,
    nutritionPer100g: override ? nutritionFromSnakeRow(override) : original,
    originalNutritionPer100g: original,
    hasOverride: override !== null,
    hasOverridePhoto: override?.nutrition_photo_key != null,
    canRename: product.createdByUserId === userId,
    nutritionBasisUnit: product.nutritionBasisUnit,
    nutritionBasisQuantity: Number(product.nutritionBasisQuantity),
    nutritionPhotoKey: product.nutritionPhotoKey,
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
  const userId = await requireUserId();
  // source = user only: a standard row (USDA "Egg", "Banana") sharing a name
  // must never lend its learned serving weight to an OCR'd label (spec §10, §6).
  const result = await db.execute<StoredMeasuresRow>(sql`
    SELECT p.density_g_ml, p.serving_unit, p.serving_grams
    FROM products p
    WHERE lower(trim(p.name)) = lower(trim(${productName}))
      AND p.source = ${USER_SOURCE}
      AND ${visibleToUser(userId)}
    ORDER BY p.id
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

export type StandardFoodCategory = "whole" | "fat";

export interface StandardFood {
  id: string;
  slug: string;
  name: string;
  portions: readonly Portion[];
  category: StandardFoodCategory;
  nutritionPer100g: NutritionValues;
  servingUnit: string | null;
  servingGrams: number | null;
  densityGMl: number | null;
  nutritionBasisUnit: string;
  nutritionBasisQuantity: number;
}

type StandardFoodRow = SnakeNutritionRow & {
  id: string;
  standard_slug: string;
  name: string;
  name_search: string;
  standard_category: StandardFoodCategory;
  serving_unit: string | null;
  serving_grams: string | null;
  density_g_ml: string | null;
  nutrition_basis_unit: string;
  nutrition_basis_quantity: string;
  portion_overrides: Record<string, string>;
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
  portions: resolvePortions({
    standardSlug: row.standard_slug,
    nameSearch: row.name_search,
    servingUnit: row.serving_unit,
    servingGrams: row.serving_grams === null ? null : Number(row.serving_grams),
    nutritionBasisUnit: row.nutrition_basis_unit,
    overrides: Object.fromEntries(
      Object.entries(row.portion_overrides).map(([label, grams]) => [label, Number(grams)]),
    ),
  }),
  category: row.standard_category,
  nutritionPer100g: nutritionFromSnakeRow(row),
  servingUnit: row.serving_unit,
  servingGrams: row.serving_grams === null ? null : Number(row.serving_grams),
  densityGMl: row.density_g_ml === null ? null : Number(row.density_g_ml),
  nutritionBasisUnit: row.nutrition_basis_unit,
  nutritionBasisQuantity: Number(row.nutrition_basis_quantity),
});

const fetchStandardFoodRows = async (
  query: string,
  userId: string,
  category?: StandardFoodCategory,
): Promise<StandardFoodRow[]> => {
  const categoryFilter = category ? sql`AND standard_category = ${category}` : sql``;
  const result = await db.execute<StandardFoodRow>(sql`
    SELECT id, standard_slug, name, name_search, standard_category,
           energy_kcal, fat_g, saturates_g, carbohydrate_g, sugars_g, protein_g, salt_g,
           serving_unit, serving_grams, density_g_ml, nutrition_basis_unit,
           nutrition_basis_quantity, score,
           ${portionOverridesJson("ranked", userId)}
    FROM (
      SELECT *, similarity(name_search, ${toSearchText(query)}) AS score
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
  category?: StandardFoodCategory,
): Promise<StandardFood[]> => {
  const userId = await requireUserId();
  const rows = await fetchStandardFoodRows(query, userId, category);
  return rows.map(toStandardFood);
};
