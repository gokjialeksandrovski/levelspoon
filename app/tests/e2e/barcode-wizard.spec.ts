import { eq } from "drizzle-orm";
import { expect, test } from "@playwright/test";

import { db } from "../../src/lib/db";
import { productBarcodes } from "../../src/lib/db/schema";

import { seedProductWithBarcode, signUp, truncateAll } from "./support";

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

test("a barcode neither source has falls through to the normal flow without silently attaching it", async ({ page }) => {
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

  await page.getByRole("button", { name: "Save product" }).click();
  await expect(page.getByRole("heading", { name: "Amount" })).toBeVisible();

  const attached = await db.select().from(productBarcodes).where(eq(productBarcodes.barcode, "0000000000000"));
  expect(attached).toHaveLength(0);
});

test("a restricted-circulation code shows an inline message and stays on the scan step", async ({ page }) => {
  await signUp(page);

  await page.getByRole("button", { name: "New meal" }).click();
  await page.getByRole("button", { name: "Scan barcode instead" }).click();
  await page.getByLabel(/barcode photo/i).setInputFiles("../fixtures/barcodes/restricted-barcode.png");

  await expect(page.getByText(/isn't a product barcode/i)).toBeVisible();
  await expect(page.getByRole("heading", { name: "Scan the barcode" })).toBeVisible();
});
