import { eq } from "drizzle-orm";
import { pathToFileURL } from "node:url";

import { db } from "../src/lib/db";
import { products, users } from "../src/lib/db/schema";

const SEED_USER_EMAIL = "seed-user@per100.local";

// The deliberate variant pair tier-2's own matchProduct test seeds
// independently for isolation - this is for interactive local dev only,
// e.g. exercising the (future, M2b) capture flow UI by hand.
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
    SEED_PRODUCTS.map((product) => ({ ...product, createdByUserId: seedUserId })),
  );
};

const main = async () => {
  const seedUserId = await findOrCreateSeedUser();
  await seedProducts(seedUserId);
  console.log("Seeded 1 user and 2 products (including the 2%/10% variant pair).");
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
