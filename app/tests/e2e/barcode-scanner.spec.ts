import { expect, test } from "@playwright/test";

import { signUp, truncateAll } from "./support";

test.beforeEach(truncateAll);

test("live scan: the fake camera feed decodes the fixture barcode", async ({ page }) => {
  // Guards the self-hosted-WASM decision: if locateFile's override ever
  // regressed to the library's built-in CDN fallback, decoding would still
  // work and this test would still pass without this check.
  const wasmUrls: string[] = [];
  page.on("request", (request) => {
    if (request.url().endsWith(".wasm")) {
      wasmUrls.push(request.url());
    }
  });
  await signUp(page);
  await page.goto("/dev/barcode-scanner");
  await expect(page.getByTestId("detected-barcode")).toHaveText("5901234123457", { timeout: 15_000 });
  expect(wasmUrls.length).toBeGreaterThan(0);
  for (const url of wasmUrls) {
    expect(new URL(url).pathname).toMatch(/^\/zxing\//);
  }
});

test("photo fallback: uploading a barcode photo decodes the same code", async ({ page }) => {
  await signUp(page);
  await page.goto("/dev/barcode-scanner");
  await page.getByRole("button", { name: "Or upload a photo instead" }).click();
  await page.getByLabel(/barcode photo/i).setInputFiles("../fixtures/barcodes/product-barcode.png");
  await expect(page.getByTestId("detected-barcode")).toHaveText("5901234123457");
});

test("photo fallback: a photo with no barcode shows an inline error, not a silent failure", async ({ page }) => {
  await signUp(page);
  await page.goto("/dev/barcode-scanner");
  await page.getByRole("button", { name: "Or upload a photo instead" }).click();
  // Reuses an existing OCR-fixture photo (no barcode in it) rather than
  // generating a dedicated one - it only needs to NOT contain a barcode.
  await page.getByLabel(/barcode photo/i).setInputFiles("tests/e2e/fixtures/confident-product.jpg");
  await expect(page.getByText(/no barcode found/i)).toBeVisible();
});

test("camera permission denied: shows an explicit error and the photo fallback is immediately visible", async ({ page, context }) => {
  await context.clearPermissions();
  // Why a stub on top of clearPermissions(): see playwright.config.ts's
  // --use-fake-ui-for-media-stream comment.
  await page.addInitScript(() => {
    navigator.mediaDevices.getUserMedia = () => Promise.reject(new DOMException("Permission denied", "NotAllowedError"));
  });
  await signUp(page);
  await page.goto("/dev/barcode-scanner");
  await expect(page.getByText(/camera access was denied/i)).toBeVisible();
  // permission-denied forces PhotoFallback's visible prop true, so the
  // dropzone itself is showing - not the "Or upload a photo instead" toggle
  // (the two are mutually exclusive by construction, see PhotoFallback).
  await expect(page.getByLabel(/barcode photo/i)).toBeVisible();
});
