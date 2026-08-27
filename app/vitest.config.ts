import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    setupFiles: ["./vitest.setup.ts"],
    // Test files share one live Postgres database and truncate overlapping
    // tables in beforeEach, so they cannot safely run concurrently.
    fileParallelism: false,
  },
  resolve: {
    // Mirrors tsconfig.json's "@/*" -> "./src/*" path alias, which Next.js's
    // own webpack/Turbopack build resolves natively but Vitest does not pick
    // up on its own.
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
});
