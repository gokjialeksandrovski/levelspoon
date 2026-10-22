import { eq } from "drizzle-orm";
import { expect, test } from "@playwright/test";

import { db } from "../../src/lib/db";
import { productBarcodes } from "../../src/lib/db/schema";

import { seedConfidentProduct, seedProductWithBarcode, signUp, truncateAll } from "./support";

test.beforeEach(truncateAll);

test("a photo with no barcode says so, decoded by the self-hosted WASM", async ({ page }) => {
  // Without the path check this passes even if locateFile regressed to the
  // library's CDN fallback: decoding would still work.
  const wasmUrls: string[] = [];
  page.on("request", (request) => {
    if (request.url().endsWith(".wasm")) {
      wasmUrls.push(request.url());
    }
  });
  await signUp(page);

  await page.getByRole("button", { name: "New meal" }).click();
  await page.getByLabel(/barcode photo/i).setInputFiles("tests/e2e/fixtures/confident-product.jpg");

  await expect(page.getByText(/no barcode found/i)).toBeVisible();
  expect(wasmUrls.length).toBeGreaterThan(0);
  for (const url of wasmUrls) {
    expect(new URL(url).pathname).toMatch(/^\/zxing\//);
  }
});

test("scanning an already-linked barcode skips straight to the amount step", async ({ page }) => {
  await seedProductWithBarcode("5901234123457", "Existing Scanned Product");
  await signUp(page);

  await page.getByRole("button", { name: "New meal" }).click();
  await page.getByLabel(/barcode photo/i).setInputFiles("../fixtures/barcodes/product-barcode.png");

  await expect(page.getByRole("heading", { name: "Amount" })).toBeVisible();
  await expect(page.getByText("Using Existing Scanned Product")).toBeVisible();
});

test("scanning a barcode Open Food Facts recognizes lands on a prefilled confirm step, and saving attaches it", async ({ page }) => {
  await signUp(page);

  await page.getByRole("button", { name: "New meal" }).click();
  await page.getByLabel(/barcode photo/i).setInputFiles("../fixtures/barcodes/external-match-barcode.png");

  await expect(page.getByRole("heading", { name: "Confirm values" })).toBeVisible();
  await expect(page.getByLabel("Product name")).toHaveValue("Mock Product");

  await page.getByRole("button", { name: "Save product" }).click();
  await expect(page.getByRole("heading", { name: "Amount" })).toBeVisible();

  const [linked] = await db.select().from(productBarcodes).where(eq(productBarcodes.barcode, "4006381333931"));
  expect(linked.barcode).toBe("4006381333931");
});

test("a barcode neither source has falls through to the normal flow and surfaces a default-checked opt-in at confirm", async ({ page }) => {
  await signUp(page);

  await page.getByRole("button", { name: "New meal" }).click();
  await page.getByLabel(/barcode photo/i).setInputFiles("../fixtures/barcodes/not-found-barcode.png");

  // Falls back to the ordinary chooser - same step, nothing attached yet.
  await expect(page.getByRole("heading", { name: "Add a product to a meal" })).toBeVisible();

  await page.getByRole("button", { name: "Type a packaged product's name" }).click();
  await page.getByLabel("Product name").fill("Loose Bread Roll");
  await page.getByRole("button", { name: "Continue" }).click();

  await expect(page.getByRole("heading", { name: "Nutrition label" })).toBeVisible();
  await page.getByLabel(/nutrition table photo/i).setInputFiles("tests/e2e/fixtures/nutrition-valid.jpg");
  await expect(page.getByRole("heading", { name: "Confirm values" })).toBeVisible();

  const checkbox = page.getByLabel("Use the barcode you just scanned for this product");
  await expect(checkbox).toBeChecked();
  await expect(page.getByRole("button", { name: /find this product instantly next time/i })).toHaveCount(0);

  await page.getByRole("button", { name: "Save product" }).click();
  await expect(page.getByRole("heading", { name: "Amount" })).toBeVisible();

  const attached = await db.select().from(productBarcodes).where(eq(productBarcodes.barcode, "0000000000000"));
  expect(attached).toHaveLength(1);
});

test("unchecking the pre-scanned barcode opt-in saves the product with no barcode attached", async ({ page }) => {
  await signUp(page);

  await page.getByRole("button", { name: "New meal" }).click();
  await page.getByLabel(/barcode photo/i).setInputFiles("../fixtures/barcodes/not-found-barcode.png");
  await page.getByRole("button", { name: "Type a packaged product's name" }).click();
  await page.getByLabel("Product name").fill("Loose Bread Roll");
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByLabel(/nutrition table photo/i).setInputFiles("tests/e2e/fixtures/nutrition-valid.jpg");

  await page.getByLabel("Use the barcode you just scanned for this product").uncheck();
  await page.getByRole("button", { name: "Save product" }).click();
  await expect(page.getByRole("heading", { name: "Amount" })).toBeVisible();

  const attached = await db.select().from(productBarcodes).where(eq(productBarcodes.barcode, "0000000000000"));
  expect(attached).toHaveLength(0);
});

test("a pre-scanned code already bound elsewhere shows that product at confirm and never creates a duplicate", async ({ page }) => {
  await signUp(page);

  await page.getByRole("button", { name: "New meal" }).click();
  await page.getByLabel(/barcode photo/i).setInputFiles("../fixtures/barcodes/not-found-barcode.png");
  await page.getByRole("button", { name: "Type a packaged product's name" }).click();
  await page.getByLabel("Product name").fill("Loose Bread Roll");
  await page.getByRole("button", { name: "Continue" }).click();

  // Simulates another user linking this exact code to a different product
  // while this capture was in flight (barcode spec §7's race case).
  await seedProductWithBarcode("0000000000000", "Conflicting Product");

  await page.getByLabel(/nutrition table photo/i).setInputFiles("tests/e2e/fixtures/nutrition-valid.jpg");
  await expect(page.getByRole("heading", { name: "Confirm values" })).toBeVisible();
  await expect(page.getByText(/already linked to Conflicting Product/i)).toBeVisible();

  await page.getByRole("button", { name: "Use Conflicting Product instead" }).click();
  await expect(page.getByRole("heading", { name: "Amount" })).toBeVisible();
  await expect(page.getByText("Using Conflicting Product")).toBeVisible();

  const linked = await db.select().from(productBarcodes).where(eq(productBarcodes.barcode, "0000000000000"));
  expect(linked).toHaveLength(1);
});

test("a restricted-circulation code shows an inline message and leaves the entry options up", async ({ page }) => {
  await signUp(page);

  await page.getByRole("button", { name: "New meal" }).click();
  await page.getByLabel(/barcode photo/i).setInputFiles("../fixtures/barcodes/restricted-barcode.png");

  await expect(page.getByText(/not a product barcode/i)).toBeVisible();
  await expect(page.getByRole("heading", { name: "Add a product to a meal" })).toBeVisible();
  // The row the message names is right there, not one back-navigation away.
  await expect(page.getByLabel("Product photo")).toBeAttached();
});

test("the fresh-scan button at confirm attaches a barcode neither the checkbox nor an OFF hit provided", async ({ page }) => {
  await signUp(page);

  await page.getByRole("button", { name: "New meal" }).click();
  await page.getByLabel("Product photo", { exact: true }).setInputFiles("tests/e2e/fixtures/confident-product.jpg");

  // Fresh user, no seeded products - a no_match, so this lands on
  // nutrition-photo (not straight to confirm) same as any other no_match.
  // pendingBarcode stays null throughout (never scanned), so the button
  // (not the checkbox) renders at confirm once nutrition is parsed.
  await expect(page.getByRole("heading", { name: "Nutrition label" })).toBeVisible();
  await page.getByLabel(/nutrition table photo/i).setInputFiles("tests/e2e/fixtures/nutrition-valid.jpg");
  await expect(page.getByRole("heading", { name: "Confirm values" })).toBeVisible();
  await expect(page.getByLabel("Use the barcode you just scanned for this product")).toHaveCount(0);

  await page.getByRole("button", { name: /find this product instantly next time/i }).click();
  await page.getByLabel(/barcode photo/i).setInputFiles("../fixtures/barcodes/product-barcode.png");
  await expect(page.getByText("Barcode captured.")).toBeVisible();

  await page.getByRole("button", { name: "Save product" }).click();
  await expect(page.getByRole("heading", { name: "Amount" })).toBeVisible();

  const attached = await db.select().from(productBarcodes).where(eq(productBarcodes.barcode, "5901234123457"));
  expect(attached).toHaveLength(1);
});

test("a not-found-then-name-matched flow shows the link offer, and accepting it links the barcode", async ({ page }) => {
  await seedConfidentProduct("Olympus Greek Yogurt 2% Fat");
  await signUp(page);

  await page.getByRole("button", { name: "New meal" }).click();
  await page.getByLabel(/barcode photo/i).setInputFiles("../fixtures/barcodes/not-found-barcode.png");
  await page.getByRole("button", { name: "Type a packaged product's name" }).click();
  await page.getByLabel("Product name").fill("Olympus Greek Yogurt 2% Fat");
  await page.getByRole("button", { name: "Continue" }).click();

  // A typed name never auto-accepts, however exact - it always lands on the
  // pick list (product-name-step.tsx's handleManualName), so pick the hit.
  await expect(page.getByRole("heading", { name: "Which product is this?" })).toBeVisible();
  await page.getByRole("button", { name: /Olympus Greek Yogurt 2% Fat/ }).click();

  await expect(page.getByRole("heading", { name: "Amount" })).toBeVisible();
  await expect(page.getByText("Link barcode to Olympus Greek Yogurt 2% Fat?")).toBeVisible();

  await page.getByRole("button", { name: "Yes, link it" }).click();
  await expect(page.getByText("Link barcode to Olympus Greek Yogurt 2% Fat?")).toHaveCount(0);

  const linked = await db.select().from(productBarcodes).where(eq(productBarcodes.barcode, "0000000000000"));
  expect(linked).toHaveLength(1);
});

test("accepting the amount-step link offer after another user just bound the code shows the conflict, never creates a duplicate", async ({ page }) => {
  await seedConfidentProduct("Olympus Greek Yogurt 2% Fat");
  await signUp(page);

  await page.getByRole("button", { name: "New meal" }).click();
  await page.getByLabel(/barcode photo/i).setInputFiles("../fixtures/barcodes/not-found-barcode.png");
  await page.getByRole("button", { name: "Type a packaged product's name" }).click();
  await page.getByLabel("Product name").fill("Olympus Greek Yogurt 2% Fat");
  await page.getByRole("button", { name: "Continue" }).click();

  // A typed name never auto-accepts, however exact - it always lands on the
  // pick list (product-name-step.tsx's handleManualName), so pick the hit.
  await expect(page.getByRole("heading", { name: "Which product is this?" })).toBeVisible();
  await page.getByRole("button", { name: /Olympus Greek Yogurt 2% Fat/ }).click();

  await expect(page.getByRole("heading", { name: "Amount" })).toBeVisible();
  await expect(page.getByText("Link barcode to Olympus Greek Yogurt 2% Fat?")).toBeVisible();

  // Simulates another user linking this exact code to a different product
  // while this capture was in flight (barcode spec §7's race case).
  await seedProductWithBarcode("0000000000000", "Conflicting Product");

  await page.getByRole("button", { name: "Yes, link it" }).click();
  await expect(page.getByText(/already linked to Conflicting Product/i)).toBeVisible();

  await page.getByRole("button", { name: "Use Conflicting Product instead" }).click();
  await expect(page.getByRole("heading", { name: "Amount" })).toBeVisible();
  await expect(page.getByText("Using Conflicting Product")).toBeVisible();

  const linkedAfterConflict = await db.select().from(productBarcodes).where(eq(productBarcodes.barcode, "0000000000000"));
  expect(linkedAfterConflict).toHaveLength(1);
});
