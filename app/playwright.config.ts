import { config } from "dotenv";
import { defineConfig, devices } from "@playwright/test";

// The spec file imports `db` at module scope (to seed/assert against the
// real local Postgres), so the Playwright runner process itself needs
// DATABASE_URL before it collects tests — mirrors vitest.setup.ts, since
// Playwright (unlike Vitest) never loads .env.local on its own.
config({ path: ".env.local" });

export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: [
    "capture-flow.spec.ts",
    "meal-detail.spec.ts",
    "history.spec.ts",
    "day-view.spec.ts",
    "product-correction.spec.ts",
    "barcode-wizard.spec.ts",
    "portion-chips.spec.ts",
    "label-photo-reuse.spec.ts",
    "duplicate-product.spec.ts",
    "weight-goal.spec.ts",
    "intake-estimate.spec.ts",
    "macro-targets.spec.ts",
    "measured-burn.spec.ts",
    "recipes.spec.ts",
    "lazy-track.spec.ts",
    "copy-paste.spec.ts",
  ],
  fullyParallel: false,
  // Every spec file's `beforeEach` truncates the same shared Postgres tables,
  // so two spec files must never execute concurrently - `fullyParallel: false`
  // alone only serializes tests *within* one file; Playwright still hands
  // separate files to separate workers by default, which races their
  // TRUNCATEs against each other.
  workers: 1,
  use: { baseURL: "http://localhost:3000" },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    command: "pnpm run dev",
    url: "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: { OCR_PROVIDER: "mock", QUANTITY_PROVIDER: "mock", BARCODE_LOOKUP_PROVIDER: "mock", MEAL_ESTIMATE_PROVIDER: "mock" },
  },
});
