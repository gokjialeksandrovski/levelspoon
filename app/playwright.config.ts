// app/playwright.config.ts
import path from "node:path";

import { config } from "dotenv";
import { defineConfig, devices } from "@playwright/test";

// The spec file imports `db` at module scope (to seed/assert against the
// real local Postgres), so the Playwright runner process itself needs
// DATABASE_URL before it collects tests — mirrors vitest.setup.ts, since
// Playwright (unlike Vitest) never loads .env.local on its own.
config({ path: ".env.local" });

// Committed fixture (spec 2026-09-15-barcode-scanning-design T2) - a real,
// decodable EAN-13, not a blank clip. Chromium loops this file for every
// getUserMedia call made anywhere in the suite; only barcode-scanner.spec.ts
// actually calls it, so this is inert for every other spec file.
const FAKE_BARCODE_VIDEO = path.resolve("../fixtures/barcodes/product-barcode.y4m");

export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: [
    "capture-flow.spec.ts",
    "meal-detail.spec.ts",
    "history.spec.ts",
    "day-view.spec.ts",
    "product-correction.spec.ts",
    "barcode-scanner.spec.ts",
    "barcode-wizard.spec.ts",
    "portion-chips.spec.ts",
    "label-photo-reuse.spec.ts",
    "duplicate-product.spec.ts",
    "weight-goal.spec.ts",
    "intake-estimate.spec.ts",
    "macro-targets.spec.ts",
    "measured-burn.spec.ts",
    "recipes.spec.ts",
  ],
  fullyParallel: false,
  // Every spec file's `beforeEach` truncates the same shared Postgres tables,
  // so two spec files must never execute concurrently - `fullyParallel: false`
  // alone only serializes tests *within* one file; Playwright still hands
  // separate files to separate workers by default, which races their
  // TRUNCATEs against each other. Pinning a single worker was never needed
  // while this config listed only one spec file - it now lists several.
  workers: 1,
  use: { baseURL: "http://localhost:3000" },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        // Playwright's own CDP-level grant. Kept alongside the launch flags
        // below for defense in depth, but --use-fake-ui-for-media-stream is
        // what actually makes getUserMedia() succeed deterministically here -
        // without it, headless Chromium rejects getUserMedia() nondeterministically
        // even with this permission granted (observed empirically: repeated,
        // isolated runs of the live-scan test failed with a real denial ~every
        // time until this flag was added). Because that flag auto-accepts every
        // getUserMedia() call unconditionally, context.clearPermissions() alone
        // can no longer simulate a denial - the one test that needs a real
        // denial stubs getUserMedia() directly instead (see barcode-scanner.spec.ts).
        permissions: ["camera"],
        launchOptions: {
          args: [
            "--use-fake-device-for-media-stream",
            "--use-fake-ui-for-media-stream",
            `--use-file-for-fake-video-capture=${FAKE_BARCODE_VIDEO}`,
          ],
        },
      },
    },
  ],
  webServer: {
    command: "npm run dev",
    url: "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: { OCR_PROVIDER: "mock", QUANTITY_PROVIDER: "mock", BARCODE_LOOKUP_PROVIDER: "mock" },
  },
});
