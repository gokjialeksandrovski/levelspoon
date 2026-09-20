import { expect, test } from "@playwright/test";

import { signUp, startCapture, truncateAll, uploadNutritionPhoto } from "./support";

const LABEL_BYTES = Buffer.from("shared-label-bytes");

test.beforeEach(truncateAll);

test("refuses a label photo that already belongs to another product", async ({ page }) => {
  await signUp(page);
  await startCapture(page, "Bella Farm Yoghurt");
  await uploadNutritionPhoto(page, LABEL_BYTES);
  await page.getByRole("button", { name: "Save product" }).click();
  await expect(page.getByLabel("Amount", { exact: true })).toBeVisible();

  await startCapture(page, "Candy Bar");
  await uploadNutritionPhoto(page, LABEL_BYTES);

  await expect(page.getByText(/already belongs to Bella Farm Yoghurt/)).toBeVisible();
  await expect(page.getByRole("button", { name: /Save product/ })).toHaveCount(0);
});
