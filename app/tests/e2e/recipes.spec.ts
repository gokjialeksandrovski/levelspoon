import { expect, test } from "@playwright/test";

import { logOneIngredient, seedConfidentProduct, signUp, truncateAll } from "./support";

test.beforeEach(truncateAll);

test("saving a meal as a recipe states the privacy fact and adds the subtitle", async ({ page }) => {
  await seedConfidentProduct();
  await signUp(page);
  await logOneIngredient(page);

  await page.getByRole("button", { name: "Save as recipe" }).click();
  await expect(page.getByText("Saved to your account only. No one else can see your recipes.")).toBeVisible();

  const saveButton = page.getByRole("button", { name: "Save", exact: true });
  await expect(saveButton).toBeDisabled();
  await page.getByLabel("Name", { exact: true }).fill("Chicken rice bowl");
  await saveButton.click();

  await expect(page.getByText("From your saved recipes: Chicken rice bowl")).toBeVisible();
  await expect(page.getByRole("button", { name: "Save as recipe" })).toHaveCount(0);
});

test("cancelling the save sheet writes nothing and fires no request", async ({ page }) => {
  await seedConfidentProduct();
  await signUp(page);
  await logOneIngredient(page);
  // The initial mount's own getMealDetail fetch (doubled by Strict Mode in
  // dev) must settle before the listener attaches, or it reads as a request
  // this test caused. Waiting for the button confirms that fetch resolved.
  const saveAsRecipeButton = page.getByRole("button", { name: "Save as recipe" });
  await saveAsRecipeButton.waitFor();

  const requests: string[] = [];
  page.on("request", (request) => {
    if (request.method() === "POST") requests.push(request.url());
  });

  await saveAsRecipeButton.click();
  await page.getByLabel("Name", { exact: true }).fill("Never saved");
  await page.getByRole("button", { name: "Cancel" }).click();

  await expect(page.getByLabel("Name", { exact: true })).toHaveCount(0);
  await expect(page.getByText(/From your saved recipes/)).toHaveCount(0);
  expect(requests).toHaveLength(0);

  // Reopening starts from a blank field, not the abandoned draft.
  await page.getByRole("button", { name: "Save as recipe" }).click();
  await expect(page.getByLabel("Name", { exact: true })).toHaveValue("");
});

test("Escape dismisses the save sheet", async ({ page }) => {
  await seedConfidentProduct();
  await signUp(page);
  await logOneIngredient(page);

  await page.getByRole("button", { name: "Save as recipe" }).click();
  await page.keyboard.press("Escape");
  await expect(page.getByLabel("Name", { exact: true })).toHaveCount(0);
});

test("a meal edited after saving carries the red divergence line", async ({ page }) => {
  await seedConfidentProduct();
  await signUp(page);
  await logOneIngredient(page);

  await page.getByRole("button", { name: "Save as recipe" }).click();
  await page.getByLabel("Name", { exact: true }).fill("Chicken rice bowl");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByText("From your saved recipes: Chicken rice bowl")).toBeVisible();

  await page.getByRole("button", { name: "Edit" }).click();
  await page.getByLabel("Amount", { exact: true }).fill("100");
  await page.getByRole("button", { name: "Save", exact: true }).click();

  const line = page.getByRole("alert").filter({ hasText: "no longer matches" });
  await expect(line).toBeVisible();
  await expect(line).toContainText('This meal no longer matches "Chicken rice bowl".');
  // Standing fact, not a banner: nothing dismisses it.
  await expect(line.getByRole("button")).toHaveCount(0);
});

test("a meal with no ingredients offers no recipe control", async ({ page }) => {
  await seedConfidentProduct();
  await signUp(page);
  await page.getByRole("button", { name: "New meal" }).click();
  await page.waitForURL(/\/meals\/[^/]+\/capture$/);
  const mealUrl = page.url().replace(/\/capture$/, "");
  await page.goto(mealUrl);

  await expect(page.getByText("No ingredients yet.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Save as recipe" })).toHaveCount(0);
});

const saveCurrentMealAsRecipe = async (page: import("@playwright/test").Page, name: string) => {
  await page.getByRole("button", { name: "Save as recipe" }).click();
  // exact: true - cooking-fat-control's always-mounted "Food name" field is a
  // substring match on "Name" otherwise (strict-mode violation), same reason
  // this file's own first test already scopes this field.
  await page.getByLabel("Name", { exact: true }).fill(name);
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByText(`From your saved recipes: ${name}`)).toBeVisible();
};

test("a user with no recipes sees the Add meals section with both rows locked", async ({ page }) => {
  await seedConfidentProduct();
  await signUp(page);
  await page.getByRole("button", { name: "New meal" }).click();
  await page.waitForURL(/\/meals\/[^/]+\/capture$/);

  await expect(page.getByText("Add meals")).toBeVisible();
  await expect(page.getByRole("button", { name: "Use one of your recipes" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Lazy track" })).toBeDisabled();
});

test("a saved recipe unlocks the row and enters into a fresh meal", async ({ page }) => {
  await seedConfidentProduct();
  await signUp(page);
  await logOneIngredient(page);
  await saveCurrentMealAsRecipe(page, "Chicken rice bowl");

  await page.goto("/");
  await page.getByRole("button", { name: "New meal" }).click();
  await page.waitForURL(/\/meals\/[^/]+\/capture$/);

  const recipeRow = page.getByRole("button", { name: "Use one of your recipes" });
  await expect(recipeRow).toBeEnabled();
  await recipeRow.click();

  // The picker prices each recipe, so a row is distinguishable from a
  // same-named sibling by its figures alone.
  // ^-anchored: an unanchored match also catches "Rename Chicken rice bowl"
  // and "Delete Chicken rice bowl", which both contain the recipe's name too.
  await expect(page.getByRole("button", { name: /^Chicken rice bowl/ })).toContainText("140 kcal");
  await page.getByRole("button", { name: /^Chicken rice bowl/ }).click();

  await page.waitForURL(/\/meals\/[^/]+$/);
  await expect(page.getByText("From your saved recipes: Chicken rice bowl")).toBeVisible();
  await expect(page.getByText(/200 ?g/)).toBeVisible();
});

test("leaving the picker writes nothing", async ({ page }) => {
  await seedConfidentProduct();
  await signUp(page);
  await logOneIngredient(page);
  await saveCurrentMealAsRecipe(page, "Chicken rice bowl");

  await page.goto("/");
  await page.getByRole("button", { name: "New meal" }).click();
  await page.waitForURL(/\/meals\/[^/]+\/capture$/);
  await page.getByRole("button", { name: "Use one of your recipes" }).click();
  await page.getByRole("button", { name: "Choose a different way" }).click();

  // "Scan the barcode" is the row's visible title, not any element's
  // accessible name - the row is a <label>, and its file input's own
  // accessible name is its distinct inputLabel ("Barcode photo").
  await expect(page.getByLabel("Barcode photo")).toBeVisible();
});

test("renaming from the picker keeps the row and cancels cleanly", async ({ page }) => {
  await seedConfidentProduct();
  await signUp(page);
  await logOneIngredient(page);
  await saveCurrentMealAsRecipe(page, "Chicken rice bowl");

  await page.goto("/");
  await page.getByRole("button", { name: "New meal" }).click();
  await page.waitForURL(/\/meals\/[^/]+\/capture$/);
  await page.getByRole("button", { name: "Use one of your recipes" }).click();

  await page.getByRole("button", { name: "Rename Chicken rice bowl" }).click();
  await page.getByLabel("Recipe name").fill("Nope");
  await page.getByRole("button", { name: "Cancel rename" }).click();
  await expect(page.getByRole("button", { name: /^Chicken rice bowl/ })).toBeVisible();

  await page.getByRole("button", { name: "Rename Chicken rice bowl" }).click();
  await page.getByLabel("Recipe name").fill("Bowl");
  await page.getByRole("button", { name: "Save name" }).click();
  await expect(page.getByRole("button", { name: /^Bowl/ })).toBeVisible();
});

test("deleting from the picker arms first and empties the list", async ({ page }) => {
  await seedConfidentProduct();
  await signUp(page);
  await logOneIngredient(page);
  await saveCurrentMealAsRecipe(page, "Chicken rice bowl");

  await page.goto("/");
  await page.getByRole("button", { name: "New meal" }).click();
  await page.waitForURL(/\/meals\/[^/]+\/capture$/);
  await page.getByRole("button", { name: "Use one of your recipes" }).click();

  await page.getByRole("button", { name: "Delete Chicken rice bowl" }).click();
  await page.getByRole("button", { name: "Keep it" }).click();
  await expect(page.getByRole("button", { name: /^Chicken rice bowl/ })).toBeVisible();

  await page.getByRole("button", { name: "Delete Chicken rice bowl" }).click();
  await page.getByRole("button", { name: "Delete for good" }).click();
  await expect(page.getByRole("button", { name: /^Chicken rice bowl/ })).toHaveCount(0);
  await expect(page.getByText("No recipes left")).toBeVisible();
});
