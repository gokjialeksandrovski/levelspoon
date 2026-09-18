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

test("remembers an edited slice weight for one bread only", async ({ page }) => {
  await seedStandardFood("Bread, white");
  await seedStandardFood("Bread, rye");
  await signUp(page);

  await pickWholeFood(page, "bread white", "Bread, white");
  await page.getByRole("button", { name: "Edit portion sizes" }).click();
  await page.getByLabel("One slice weighs").fill("32");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByRole("button", { name: "1 slice · 32 g" })).toBeVisible();

  // A second wizard run rather than navigating back inside the first: this
  // asserts the override survives a reload, which a same-session back would not.
  await page.getByRole("button", { name: "1 slice · 32 g" }).click();
  await page.getByRole("button", { name: "Save ingredient" }).click();
  await expect(page.getByText("Ingredient saved.")).toBeVisible();
  await page.getByRole("button", { name: /add another/i }).click();

  await page.getByRole("button", { name: "Whole food, no packaging" }).click();
  await page.getByLabel("Food name").fill("bread rye");
  await page.getByRole("button", { name: "Search" }).click();
  await page.getByRole("button", { name: "Bread, rye" }).click();

  await expect(page.getByRole("button", { name: "1 slice · 28 g" })).toBeVisible();
});

test("reverts to the standard weight", async ({ page }) => {
  await seedStandardFood("Bread, white");
  await signUp(page);
  await pickWholeFood(page, "bread white", "Bread, white");

  await page.getByRole("button", { name: "Edit portion sizes" }).click();
  await page.getByLabel("One slice weighs").fill("45");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByRole("button", { name: "1 slice · 45 g" })).toBeVisible();

  await page.getByRole("button", { name: "Edit portion sizes" }).click();
  await page.getByRole("button", { name: "Use the standard sizes" }).click();
  await expect(page.getByRole("button", { name: "1 slice · 28 g" })).toBeVisible();
});

test("offers the last amount back as a chip, and names it on the meal row", async ({ page }) => {
  await seedStandardFood("Bread, white");
  await signUp(page);

  await pickWholeFood(page, "bread", "Bread, white");
  await page.getByRole("button", { name: "1 slice · 28 g" }).click();
  await page.getByRole("button", { name: "Save ingredient" }).click();
  await expect(page.getByText("Ingredient saved.")).toBeVisible();
  await page.getByRole("button", { name: /done/i }).click();
  await page.waitForURL(/\/meals\/[^/]+$/);

  // The row says what was entered, not only what it resolved to.
  await expect(page.getByText("1 slice · 28 g")).toBeVisible();

  // "New meal" lives on the home screen, not on a meal's own detail page.
  await page.goto("/");
  await pickWholeFood(page, "bread", "Bread, white");

  // One chip, not two: the recent replaces the portion chip for that unit.
  await expect(page.getByRole("button", { name: "1 slice · 28 g" })).toHaveCount(1);
});

test("shows a typed gram amount as a recent chip", async ({ page }) => {
  await seedStandardFood("Chicken breast, raw");
  await signUp(page);

  await pickWholeFood(page, "chicken", "Chicken breast, raw");
  await page.getByLabel("Amount", { exact: true }).fill("175");
  await page.getByRole("button", { name: "Save ingredient" }).click();
  await expect(page.getByText("Ingredient saved.")).toBeVisible();
  await page.getByRole("button", { name: /add another/i }).click();

  await page.getByRole("button", { name: "Whole food, no packaging" }).click();
  await page.getByLabel("Food name").fill("chicken");
  await page.getByRole("button", { name: "Search" }).click();
  await page.getByRole("button", { name: "Chicken breast, raw" }).click();

  await expect(page.getByRole("button", { name: "175 g" })).toBeVisible();
});
