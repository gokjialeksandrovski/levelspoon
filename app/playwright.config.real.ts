import { config } from "dotenv";
import { defineConfig, devices } from "@playwright/test";

// real-stack.spec.ts imports `db` at module scope (to truncate before each
// test, matching capture-flow.spec.ts's fix for the same accumulating-rows
// problem), so the Playwright runner process itself needs DATABASE_URL
// before it collects tests - mirrors playwright.config.ts's identical shim,
// since Playwright never loads .env.local on its own.
config({ path: ".env.local" });

export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: "real-stack.spec.ts",
  fullyParallel: false,
  timeout: 60_000,
  use: { baseURL: "http://localhost:3000" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "pnpm run dev",
    url: "http://localhost:3000",
    reuseExistingServer: false,
    timeout: 120_000,
    // app/.env.local sets OCR_PROVIDER=mock for local tier-3 convenience
    // (mirrors QUANTITY_PROVIDER's pattern), and Next's loadEnvConfig fills
    // in any var absent from the spawning process's env from .env.local -
    // confirmed empirically. Leaving OCR_PROVIDER unset here would silently
    // inherit "mock" and this suite would never touch the real ocr-service.
    // Only Gemini is mocked, per main spec §9.6.
    env: { OCR_PROVIDER: "real", QUANTITY_PROVIDER: "mock" },
  },
});
