import { sql } from "drizzle-orm";

import { db } from "../src/lib/db";

const main = async () => {
  await db.execute(sql`DROP SCHEMA IF EXISTS public CASCADE`);
  await db.execute(sql`CREATE SCHEMA public`);
  await db.execute(sql`DROP SCHEMA IF EXISTS drizzle CASCADE`);
  console.log("Dropped and recreated the public schema; cleared drizzle-kit's migration tracking.");
};

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => process.exit());
