import { expect, test, type Page } from "@playwright/test";

import { seedStandardFood, signUp, truncateAll } from "./support";

test.beforeEach(async () => {
  await truncateAll();
});

// Same path capture-flow.spec.ts's whole-food tests take.
const pickWholeFood = async (page: Page, query: string, name: string) => {
  await page.getByRole("button", { name: "New meal" }).click();
  await page.waitForURL(/\/meals\/[^/]+\/capture$/);
  await page.getByRole("button", { name: "Whole food, no packaging" }).click();
  await page.getByLabel("Food name").fill(query);
  await page.getByRole("button", { name: "Search" }).click();
  await page.getByRole("button", { name }).click();
};

test("logs one slice of bread in a single tap", async ({ page }) => {
  await seedStandardFood("Bread, white");
  await signUp(page);
  await pickWholeFood(page, "bread", "Bread, white");

  const chip = page.getByRole("button", { name: "1 slice · 28 g" });
  await expect(chip).toBeVisible();
  await chip.click();
  await expect(chip).toHaveAttribute("aria-pressed", "true");

  await page.getByRole("button", { name: "Save ingredient" }).click();
  await expect(page.getByText("Ingredient saved.")).toBeVisible();
  await page.getByRole("button", { name: /done/i }).click();
  await page.waitForURL(/\/meals\/[^/]+$/);

  await expect(page.getByText("28 g")).toBeVisible();
});

test("keeps the plain amount field for a food with no portions", async ({ page }) => {
  await seedStandardFood("Chicken breast, raw");
  await signUp(page);
  await pickWholeFood(page, "chicken", "Chicken breast, raw");

  await expect(page.getByRole("group", { name: "Quick amounts" })).toHaveCount(0);
  await expect(page.getByLabel("Amount", { exact: true })).toBeVisible();
});
