import { eq } from "drizzle-orm";
import { expect, test } from "@playwright/test";

import { db } from "../../src/lib/db";
import { productBarcodes } from "../../src/lib/db/schema";

import { seedConfidentProduct, seedProductWithBarcode, signUp, truncateAll } from "./support";

test.beforeEach(async ({ page, context }) => {
  await truncateAll();
  await context.clearPermissions();
  // Forces every test onto the deterministic photo-upload path: the fake
  // camera flags in playwright.config.ts apply project-wide, so without this
  // stub a real live scan races the photo upload these tests intend to
  // exercise (see barcode-scanner.spec.ts's own permission-denied test for
  // the same pattern).
  await page.addInitScript(() => {
    navigator.mediaDevices.getUserMedia = () =>
      Promise.reject(new DOMException("Permission denied", "NotAllowedError"));
  });
});

test("scanning an already-linked barcode skips straight to the amount step", async ({ page }) => {
  await seedProductWithBarcode("5901234123457", "Existing Scanned Product");
  await signUp(page);

  await page.getByRole("button", { name: "New meal" }).click();
  await page.getByRole("button", { name: "Scan barcode instead" }).click();
  await page.getByLabel(/barcode photo/i).setInputFiles("../fixtures/barcodes/product-barcode.png");

  await expect(page.getByRole("heading", { name: "Amount" })).toBeVisible();
  await expect(page.getByText("Using Existing Scanned Product")).toBeVisible();
});

test("scanning a barcode Open Food Facts recognizes lands on a prefilled confirm step, and saving attaches it", async ({ page }) => {
  await signUp(page);

  await page.getByRole("button", { name: "New meal" }).click();
  await page.getByRole("button", { name: "Scan barcode instead" }).click();
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
  await page.getByRole("button", { name: "Scan barcode instead" }).click();
  await page.getByLabel(/barcode photo/i).setInputFiles("../fixtures/barcodes/not-found-barcode.png");

  // Falls back to the ordinary chooser - same step, nothing attached yet.
  // exact:true: the wizard shell's own "Product name" title heading and
  // product-name-step's "Photograph the product name" h2 are both on screen
  // here, and the latter contains "Product name" as a substring.
  await expect(page.getByRole("heading", { name: "Product name", exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Enter the name manually instead" }).click();
  await page.getByLabel("Product name").fill("Loose Bread Roll");
  await page.getByRole("button", { name: "Continue" }).click();

  await expect(page.getByRole("heading", { name: "Nutrition label" })).toBeVisible();
  await page.getByLabel(/nutrition table photo/i).setInputFiles("tests/e2e/fixtures/nutrition-valid.jpg");
  await expect(page.getByRole("heading", { name: "Confirm values" })).toBeVisible();

  const checkbox = page.getByLabel("Use the barcode you just scanned for this product");
  await expect(checkbox).toBeChecked();
  await expect(page.getByRole("button", { name: "Help the app" })).toHaveCount(0);

  await page.getByRole("button", { name: "Save product" }).click();
  await expect(page.getByRole("heading", { name: "Amount" })).toBeVisible();

  const attached = await db.select().from(productBarcodes).where(eq(productBarcodes.barcode, "0000000000000"));
  expect(attached).toHaveLength(1);
});

test("unchecking the pre-scanned barcode opt-in saves the product with no barcode attached", async ({ page }) => {
  await signUp(page);

  await page.getByRole("button", { name: "New meal" }).click();
  await page.getByRole("button", { name: "Scan barcode instead" }).click();
  await page.getByLabel(/barcode photo/i).setInputFiles("../fixtures/barcodes/not-found-barcode.png");
  await page.getByRole("button", { name: "Enter the name manually instead" }).click();
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
  await page.getByRole("button", { name: "Scan barcode instead" }).click();
  await page.getByLabel(/barcode photo/i).setInputFiles("../fixtures/barcodes/not-found-barcode.png");
  await page.getByRole("button", { name: "Enter the name manually instead" }).click();
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

test("a restricted-circulation code shows an inline message and stays on the scan step", async ({ page }) => {
  await signUp(page);

  await page.getByRole("button", { name: "New meal" }).click();
  await page.getByRole("button", { name: "Scan barcode instead" }).click();
  await page.getByLabel(/barcode photo/i).setInputFiles("../fixtures/barcodes/restricted-barcode.png");

  await expect(page.getByText(/isn't a product barcode/i)).toBeVisible();
  await expect(page.getByRole("heading", { name: "Scan the barcode" })).toBeVisible();
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

  await page.getByRole("button", { name: "Help the app" }).click();
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
  await page.getByRole("button", { name: "Scan barcode instead" }).click();
  await page.getByLabel(/barcode photo/i).setInputFiles("../fixtures/barcodes/not-found-barcode.png");
  await page.getByRole("button", { name: "Enter the name manually instead" }).click();
  await page.getByLabel("Product name").fill("Olympus Greek Yogurt 2% Fat");
  await page.getByRole("button", { name: "Continue" }).click();

  // Confident name match skips straight to Amount - no confirm step at all.
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
  await page.getByRole("button", { name: "Scan barcode instead" }).click();
  await page.getByLabel(/barcode photo/i).setInputFiles("../fixtures/barcodes/not-found-barcode.png");
  await page.getByRole("button", { name: "Enter the name manually instead" }).click();
  await page.getByLabel("Product name").fill("Olympus Greek Yogurt 2% Fat");
  await page.getByRole("button", { name: "Continue" }).click();

  // Confident name match skips straight to Amount - no confirm step at all.
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
