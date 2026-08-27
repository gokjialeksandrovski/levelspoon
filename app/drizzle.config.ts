import { defineConfig } from "drizzle-kit";

const DATABASE_URL_ENV_VAR = "DATABASE_URL";

const connectionString = process.env[DATABASE_URL_ENV_VAR];
if (!connectionString) {
  throw new Error(`Missing required environment variable: ${DATABASE_URL_ENV_VAR}`);
}

export default defineConfig({
  schema: "./src/lib/db/schema/index.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: { url: connectionString },
});
