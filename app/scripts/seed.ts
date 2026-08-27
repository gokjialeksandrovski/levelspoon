import { eq } from "drizzle-orm";

import { db } from "../src/lib/db";
import { products, users } from "../src/lib/db/schema";

const SEED_USER_EMAIL = "seed-user@per100.local";

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

const main = async () => {
  const seedUserId = await findOrCreateSeedUser();

  // The deliberate variant pair tier-2's own matchProduct test seeds
  // independently for isolation - this is for interactive local dev only,
  // e.g. exercising the (future, M2b) capture flow UI by hand.
  await db.insert(products).values([
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
      createdByUserId: seedUserId,
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
      createdByUserId: seedUserId,
    },
  ]);

  console.log("Seeded 1 user and 2 products (including the 2%/10% variant pair).");
};

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => process.exit());
