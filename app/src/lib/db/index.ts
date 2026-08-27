import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import * as schema from "./schema";

const DATABASE_URL_ENV_VAR = "DATABASE_URL";

const connectionString = process.env[DATABASE_URL_ENV_VAR];
if (!connectionString) {
  throw new Error(
    `Missing required environment variable: ${DATABASE_URL_ENV_VAR}. Copy .env.example to .env.local and fill it in.`,
  );
}

const pool = new Pool({ connectionString });

export const db = drizzle(pool, { schema });
