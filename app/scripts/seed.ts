import { readFileSync } from "node:fs";

import { eq, sql } from "drizzle-orm";
import { pathToFileURL } from "node:url";

import { db } from "../src/lib/db";
import { toSearchText } from "../src/lib/db/search-text";
import { products, users, weightEntries, weightGoals } from "../src/lib/db/schema";
import { addCalendarDays, todayLocalDateString } from "../src/lib/date/day-bounds";

const SEED_USER_EMAIL = "seed-user@per100.local";

// The deliberate variant pair tier-2's own matchProduct test seeds
// independently for isolation - this is for interactive local dev only,
// e.g. exercising the (future, M2b) capture flow UI by hand.
//
// Deliberate exception to "never mint a photo key any other way"
// (app/src/lib/db/photo-keys.ts, CLAUDE.md): these two literal strings are
// placeholders with no photo bytes behind them - MinIO holds no object at
// either key, and no real capture-flow write path takes this shortcut.
export const SEED_PRODUCTS = [
  {
    name: "Olympus Greek Yogurt 2% Fat",
    energyKcal: "70",
    fatG: "2.0",
    saturatesG: "1.2",
    carbohydrateG: "4.0",
    sugarsG: "4.0",
    proteinG: "9.0",
    saltG: "0.18",
    nutritionPhotoKey: "seed/olympus-2pct.jpg",
  },
  {
    name: "Olympus Greek Yogurt 10% Fat",
    energyKcal: "131",
    fatG: "10.0",
    saturatesG: "6.5",
    carbohydrateG: "4.0",
    sugarsG: "4.0",
    proteinG: "8.0",
    saltG: "0.15",
    nutritionPhotoKey: "seed/olympus-10pct.jpg",
  },
];

const findOrCreateSeedUser = async (): Promise<string> => {
  const [existing] = await db.select().from(users).where(eq(users.email, SEED_USER_EMAIL));
  if (existing) {
    return existing.id;
  }

  const [created] = await db
    .insert(users)
    .values({ email: SEED_USER_EMAIL, name: "Seed User" })
    .returning();
  return created.id;
};

export const seedProducts = async (seedUserId: string): Promise<void> => {
  await db.insert(products).values(
    SEED_PRODUCTS.map((product) => ({
      ...product,
      nameSearch: toSearchText(product.name),
      createdByUserId: seedUserId,
    })),
  );
};

// A seeded goal with two readings, so the day view's weight row has a rail to
// draw and a "last change" line straight after db:reset. The second reading is
// six days old against a weekly cadence, which puts the row in its resting
// state one day from due - the state most worth seeing after a reset.
const GOAL_START_DAYS_AGO = -20;
const LAST_READING_DAYS_AGO = -6;
const SEED_CHECKIN_INTERVAL_DAYS = 7;

export const seedWeightGoal = async (seedUserId: string): Promise<void> => {
  const today = todayLocalDateString(Intl.DateTimeFormat().resolvedOptions().timeZone);
  const startDate = addCalendarDays(today, GOAL_START_DAYS_AGO);
  await db.insert(weightGoals).values({
    userId: seedUserId,
    mode: "target",
    startWeightKg: "84.8",
    startDate,
    targetWeightKg: "72.0",
    rateKgPerWeek: "0.50",
    checkinIntervalDays: SEED_CHECKIN_INTERVAL_DAYS,
  });
  await db.insert(weightEntries).values([
    { userId: seedUserId, measuredOn: startDate, weightKg: "84.8" },
    { userId: seedUserId, measuredOn: addCalendarDays(today, LAST_READING_DAYS_AGO), weightKg: "78.7" },
  ]);
};

export const SYSTEM_USER_EMAIL = "system@per100.local";

const STANDARD_FOODS_PATH = new URL("../../fixtures/standard-foods.json", import.meta.url);

const PER_100G_KEYS = [
  "energyKcal", "fatG", "saturatesG", "carbohydrateG", "sugarsG", "proteinG", "saltG",
] as const;

export interface StandardFoodFixture {
  slug: string;
  name: string;
  per100g: Record<(typeof PER_100G_KEYS)[number], number>;
  servingUnit: string | null;
  servingGrams: number | null;
  densityGMl: number | null;
  category: "whole" | "fat";
}

export class StandardFoodRowError extends Error {
  constructor(slug: string, detail: string) {
    super(`standard-foods.json row "${slug}": ${detail}`);
    this.name = "StandardFoodRowError";
  }
}

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

const assertPer100g = (slug: string, per100g: unknown): void => {
  if (typeof per100g !== "object" || per100g === null) {
    throw new StandardFoodRowError(slug, "per100g must be an object");
  }
  for (const key of PER_100G_KEYS) {
    const amount = (per100g as Record<string, unknown>)[key];
    if (!isFiniteNumber(amount) || amount < 0) {
      throw new StandardFoodRowError(slug, `per100g.${key} must be a number >= 0`);
    }
  }
};

const assertServing = (slug: string, row: Record<string, unknown>): void => {
  const unitIsNull = row.servingUnit == null;
  const gramsIsNull = row.servingGrams == null;
  if (unitIsNull !== gramsIsNull) {
    throw new StandardFoodRowError(slug, "servingUnit and servingGrams must be both set or both null");
  }
  if (!unitIsNull && (typeof row.servingUnit !== "string" || row.servingUnit.trim() === "")) {
    throw new StandardFoodRowError(slug, "servingUnit must be a non-empty string");
  }
  if (!gramsIsNull && (!isFiniteNumber(row.servingGrams) || (row.servingGrams as number) <= 0)) {
    throw new StandardFoodRowError(slug, "servingGrams must be a positive number");
  }
};

const assertNameAndCategory = (slug: string, row: Record<string, unknown>): void => {
  if (typeof row.name !== "string" || row.name.trim() === "") {
    throw new StandardFoodRowError(slug, "name must be a non-empty string");
  }
  if (row.category !== "whole" && row.category !== "fat") {
    throw new StandardFoodRowError(slug, 'category must be "whole" or "fat"');
  }
  // A fat row's whole purpose is converting spoons to grams, which is
  // impossible without a density.
  if (row.category === "fat" && (!isFiniteNumber(row.densityGMl) || (row.densityGMl as number) <= 0)) {
    throw new StandardFoodRowError(slug, "a fat row must carry a positive densityGMl");
  }
};

export const assertValidStandardFood = (value: unknown): StandardFoodFixture => {
  const row = (value ?? {}) as Record<string, unknown>;
  const slug = typeof row.slug === "string" ? row.slug : "(missing slug)";
  if (!slug || slug === "(missing slug)") {
    throw new StandardFoodRowError(slug, "slug must be a non-empty string");
  }
  assertNameAndCategory(slug, row);
  assertPer100g(slug, row.per100g);
  assertServing(slug, row);
  return value as StandardFoodFixture;
};

export const assertNoDuplicateSlugs = (rows: readonly StandardFoodFixture[]): void => {
  const seenSlugs = new Set<string>();
  for (const row of rows) {
    if (seenSlugs.has(row.slug)) {
      throw new StandardFoodRowError(row.slug, "duplicate slug in fixture file");
    }
    seenSlugs.add(row.slug);
  }
};

const loadStandardFoods = (): StandardFoodFixture[] => {
  const raw = JSON.parse(readFileSync(STANDARD_FOODS_PATH, "utf8")) as unknown;
  if (!Array.isArray(raw) || raw.length === 0) {
    throw new StandardFoodRowError("(file)", "expected a non-empty JSON array");
  }
  const rows = raw.map(assertValidStandardFood);
  assertNoDuplicateSlugs(rows);
  return rows;
};

const per100gColumns = (per100g: StandardFoodFixture["per100g"]) => ({
  energyKcal: String(per100g.energyKcal),
  fatG: String(per100g.fatG),
  saturatesG: String(per100g.saturatesG),
  carbohydrateG: String(per100g.carbohydrateG),
  sugarsG: String(per100g.sugarsG),
  proteinG: String(per100g.proteinG),
  saltG: String(per100g.saltG),
});

const toStandardInsert = (systemUserId: string) => (row: StandardFoodFixture) => ({
  name: row.name,
  nameSearch: toSearchText(row.name),
  source: "standard" as const,
  standardSlug: row.slug,
  standardCategory: row.category,
  ...per100gColumns(row.per100g),
  servingUnit: row.servingUnit,
  servingGrams: row.servingGrams === null ? null : String(row.servingGrams),
  densityGMl: row.densityGMl === null ? null : String(row.densityGMl),
  nutritionPhotoKey: null,
  createdByUserId: systemUserId,
});

// On re-seed, every column a corrected fixture might change is pulled from the
// row Postgres would otherwise have rejected as a duplicate. id / source /
// created_by stay put.
const STANDARD_RESEED_SET = {
  name: sql`excluded.name`,
  nameSearch: sql`excluded.name_search`,
  standardCategory: sql`excluded.standard_category`,
  energyKcal: sql`excluded.energy_kcal`,
  fatG: sql`excluded.fat_g`,
  saturatesG: sql`excluded.saturates_g`,
  carbohydrateG: sql`excluded.carbohydrate_g`,
  sugarsG: sql`excluded.sugars_g`,
  proteinG: sql`excluded.protein_g`,
  saltG: sql`excluded.salt_g`,
  servingUnit: sql`excluded.serving_unit`,
  servingGrams: sql`excluded.serving_grams`,
  densityGMl: sql`excluded.density_g_ml`,
};

export const findOrCreateSystemUser = async (): Promise<string> => {
  const [existing] = await db.select().from(users).where(eq(users.email, SYSTEM_USER_EMAIL));
  if (existing) {
    return existing.id;
  }
  const [created] = await db
    .insert(users)
    .values({ email: SYSTEM_USER_EMAIL, name: "Per100 System" })
    .returning();
  return created.id;
};

export const seedStandardFoods = async (systemUserId: string): Promise<number> => {
  const rows = loadStandardFoods().map(toStandardInsert(systemUserId));
  await db
    .insert(products)
    .values(rows)
    .onConflictDoUpdate({ target: products.standardSlug, set: STANDARD_RESEED_SET });
  return rows.length;
};

const main = async () => {
  const seedUserId = await findOrCreateSeedUser();
  await seedProducts(seedUserId);
  await seedWeightGoal(seedUserId);
  const systemUserId = await findOrCreateSystemUser();
  const standardCount = await seedStandardFoods(systemUserId);
  console.log(
    `Seeded 2 users (seed + system), 2 products (2%/10% variant pair), 1 weight goal and ${standardCount} standard foods.`,
  );
};

// scripts/seed.test.ts imports seedProducts for testing, which executes this
// module's top level - without this guard, that import alone would also run
// main() (a real DB write) and this file's own process.exit(), which kills
// the Vitest worker mid-suite. Only run main() when this file is the actual
// entry point (`npm run db:seed`), not when it's merely imported.
const isDirectRun = process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isDirectRun) {
  main()
    .catch((error) => {
      console.error(error);
      process.exitCode = 1;
    })
    .finally(() => process.exit());
}
