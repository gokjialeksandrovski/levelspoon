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

  // Linking the meal to a recipe adds its own "Edit this recipe" control,
  // which also matches "Edit" by substring. Neither name is literally "Edit"
  // (aria-label is "Edit {product} amount"), so exact:true can't disambiguate
  // either - the suffix is what's unique to the ingredient row's own button.
  await page.getByRole("button", { name: /amount$/ }).click();
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

test("a user with no recipes sees the recipe row locked and lazy track open", async ({ page }) => {
  await seedConfidentProduct();
  await signUp(page);
  await page.getByRole("button", { name: "New meal" }).click();
  await page.waitForURL(/\/meals\/[^/]+\/capture$/);

  await expect(page.getByRole("heading", { name: "Add a meal" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Use one of your recipes" })).toBeDisabled();
  await expect(page.getByRole("button", { name: /Lazy track/ })).toBeEnabled();
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
  await page.getByRole("button", { name: "Back", exact: true }).click();

  // "Scan the barcode" is the row's visible title, not any element's
  // accessible name - the row is a <label>, and its file input's own
  // accessible name is its distinct inputLabel ("Barcode photo").
  await expect(page.getByLabel("Barcode photo")).toBeVisible();
});

test("search narrows the picker as the user types, and each row carries the accent-coded macros", async ({ page }) => {
  await seedConfidentProduct();
  await signUp(page);
  await logOneIngredient(page);
  await saveCurrentMealAsRecipe(page, "Chicken rice bowl");
  await page.goto("/");
  await logOneIngredient(page);
  await saveCurrentMealAsRecipe(page, "Overnight oats");

  await page.goto("/");
  await page.getByRole("button", { name: "New meal" }).click();
  await page.waitForURL(/\/meals\/[^/]+\/capture$/);
  await page.getByRole("button", { name: "Use one of your recipes" }).click();

  const chickenRow = page.getByRole("button", { name: /^Chicken rice bowl/ });
  const oatsRow = page.getByRole("button", { name: /^Overnight oats/ });
  await expect(chickenRow).toBeVisible();
  await expect(oatsRow).toBeVisible();
  // The protein figure wears its accent, same as a meal row on the day view.
  await expect(chickenRow.locator(".text-accent-protein")).toBeVisible();

  const search = page.getByLabel("Search your recipes");
  await search.fill("RICE chicken");
  await expect(chickenRow).toBeVisible();
  await expect(oatsRow).toHaveCount(0);

  await search.fill("pizza");
  await expect(page.getByText('No recipe matches "pizza".')).toBeVisible();

  await search.fill("");
  await expect(chickenRow).toBeVisible();
  await expect(oatsRow).toBeVisible();
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

const enterSavedRecipe = async (page: import("@playwright/test").Page, name: string) => {
  await page.goto("/");
  await page.getByRole("button", { name: "New meal" }).click();
  await page.waitForURL(/\/meals\/[^/]+\/capture$/);
  await page.getByRole("button", { name: "Use one of your recipes" }).click();
  await page.getByRole("button", { name: new RegExp(`^${name}`) }).click();
  await page.waitForURL(/\/meals\/[^/]+$/);
};

test("a linked meal offers Edit this recipe instead of Save as recipe", async ({ page }) => {
  await seedConfidentProduct();
  await signUp(page);
  await logOneIngredient(page);
  await saveCurrentMealAsRecipe(page, "Chicken rice bowl");

  await expect(page.getByRole("button", { name: "Edit this recipe" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Save as recipe" })).toHaveCount(0);
});

test("opening the sheet after an inline edit shows the new amount, not a stale draft", async ({ page }) => {
  await seedConfidentProduct();
  await signUp(page);
  await logOneIngredient(page);
  await saveCurrentMealAsRecipe(page, "Chicken rice bowl");

  // The sheet stays mounted across this in-place reload (Task 9 review,
  // Critical): without a fresh key per open, its draft would still read the
  // 200 g it was first mounted with, and Save would silently revert this edit.
  await page.getByRole("button", { name: /amount$/ }).click();
  await page.getByLabel("Amount", { exact: true }).fill("150");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByText(/150 ?g/)).toBeVisible();

  const sheet = page.getByRole("dialog", { name: "Edit this recipe" });
  await page.getByRole("button", { name: "Edit this recipe" }).click();
  await expect(sheet.getByLabel("Olympus Greek Yogurt 2% Fat amount")).toHaveValue("150");
});

test("cancelling either pane leaves the meal untouched and fires no request", async ({ page }) => {
  await seedConfidentProduct();
  await signUp(page);
  await logOneIngredient(page);
  await saveCurrentMealAsRecipe(page, "Chicken rice bowl");

  const requests: string[] = [];
  page.on("request", (request) => {
    if (request.method() === "POST") requests.push(request.url());
  });

  // Scoped to the dialog: the ingredient row behind it has its own "Edit
  // Olympus Greek Yogurt 2% Fat amount" control, an unrelated background
  // match for the same substring that a page-wide getByLabel also finds.
  const sheet = page.getByRole("dialog", { name: "Edit this recipe" });
  await page.getByRole("button", { name: "Edit this recipe" }).click();
  await sheet.getByLabel("Olympus Greek Yogurt 2% Fat amount").fill("999");
  await sheet.getByRole("button", { name: "Cancel" }).click();
  await expect(page.getByText(/200 ?g/)).toBeVisible();

  await page.getByRole("button", { name: "Edit this recipe" }).click();
  // The draft reopens from the meal, not from the abandoned edit.
  await expect(sheet.getByLabel("Olympus Greek Yogurt 2% Fat amount")).toHaveValue("200");
  await sheet.getByRole("button", { name: "Continue" }).click();
  await sheet.getByRole("button", { name: "Cancel" }).click();
  await expect(page.getByText(/200 ?g/)).toBeVisible();

  // Exactly one read fires, from earlierMealsFromRecipe on Continue - not
  // "at most one", which would also pass if that read never fired at all
  // and a Cancel fired something instead.
  expect(requests.length).toBe(1);
});

test("Back returns from the fork to the amounts pane", async ({ page }) => {
  await seedConfidentProduct();
  await signUp(page);
  await logOneIngredient(page);
  await saveCurrentMealAsRecipe(page, "Chicken rice bowl");

  const sheet = page.getByRole("dialog", { name: "Edit this recipe" });
  await page.getByRole("button", { name: "Edit this recipe" }).click();
  await sheet.getByLabel("Olympus Greek Yogurt 2% Fat amount").fill("250");
  await sheet.getByRole("button", { name: "Continue" }).click();
  await sheet.getByRole("button", { name: "Back" }).click();

  await expect(sheet.getByLabel("Olympus Greek Yogurt 2% Fat amount")).toHaveValue("250");
});

test("removing every row disables Save with a reason", async ({ page }) => {
  await seedConfidentProduct();
  await signUp(page);
  await logOneIngredient(page);
  await saveCurrentMealAsRecipe(page, "Chicken rice bowl");

  // Scoped for the same reason as above: the ingredient row behind the sheet
  // has its own "Remove Olympus Greek Yogurt 2% Fat" button too.
  const sheet = page.getByRole("dialog", { name: "Edit this recipe" });
  await page.getByRole("button", { name: "Edit this recipe" }).click();
  await sheet.getByRole("button", { name: "Remove Olympus Greek Yogurt 2% Fat" }).click();

  await expect(page.getByText("A recipe needs at least one ingredient.")).toBeVisible();
  await expect(sheet.getByRole("button", { name: "Continue" })).toBeDisabled();
});

test("overwrite updates a matching earlier meal and leaves a diverged one named", async ({ page }) => {
  await seedConfidentProduct();
  await signUp(page);
  await logOneIngredient(page);
  await saveCurrentMealAsRecipe(page, "Chicken rice bowl");

  // Meal 2: entered and then hand-edited, so it diverges. Suffix-matched for
  // the same reason as the divergence test above: this meal is also linked,
  // so "Edit this recipe" is a second substring match for "Edit".
  await enterSavedRecipe(page, "Chicken rice bowl");
  const meal2Url = page.url();
  await page.getByRole("button", { name: /amount$/ }).click();
  await page.getByLabel("Amount", { exact: true }).fill("150");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByRole("alert").filter({ hasText: "no longer matches" })).toBeVisible();

  // Meal 3: entered and left alone, so it still matches.
  await enterSavedRecipe(page, "Chicken rice bowl");
  const meal3Url = page.url();
  // Meal 4: the one being edited.
  await enterSavedRecipe(page, "Chicken rice bowl");

  const sheet = page.getByRole("dialog", { name: "Edit this recipe" });
  await page.getByRole("button", { name: "Edit this recipe" }).click();
  await sheet.getByLabel("Olympus Greek Yogurt 2% Fat amount").fill("250");
  await sheet.getByRole("button", { name: "Continue" }).click();

  // Exact copy, not an alternation: a partition that came back backwards
  // (offering the hand-edited Meal 2, excusing the two matching meals) would
  // fail both of these, where the old alternation would have passed either way.
  const tick = sheet.getByRole("checkbox", {
    name: "Also update Meal 1 and Meal 3 from earlier today (+70 kcal)",
  });
  await expect(tick).toBeVisible();
  await expect(page.getByText("Meal 2 was changed after you logged it, so it is left as it is.")).toBeVisible();
  await tick.check();
  await sheet.getByRole("button", { name: "Save", exact: true }).click();

  await expect(page.getByText(/250 ?g/)).toBeVisible();
  await expect(page.getByRole("alert").filter({ hasText: "no longer matches" })).toHaveCount(0);

  // The retro-update actually reached Meal 3 (ticked, matched) and left
  // Meal 2 (diverged, excluded) at its own hand-edited amount - checked on
  // their own pages, not inferred from Meal 4's.
  await page.goto(meal3Url);
  await expect(page.getByText(/250 ?g/)).toBeVisible();
  await page.goto(meal2Url);
  await expect(page.getByText(/150 ?g/)).toBeVisible();
});

test("saving as a new recipe relinks this meal and leaves the original alone", async ({ page }) => {
  await seedConfidentProduct();
  await signUp(page);
  await logOneIngredient(page);
  await saveCurrentMealAsRecipe(page, "Chicken rice bowl");
  await enterSavedRecipe(page, "Chicken rice bowl");

  const sheet = page.getByRole("dialog", { name: "Edit this recipe" });
  await page.getByRole("button", { name: "Edit this recipe" }).click();
  await sheet.getByLabel("Olympus Greek Yogurt 2% Fat amount").fill("250");
  await sheet.getByRole("button", { name: "Continue" }).click();
  await sheet.getByRole("radio", { name: "Save as a new recipe" }).check();
  await sheet.getByLabel("New recipe name").fill("Bigger bowl");
  await sheet.getByRole("button", { name: "Save", exact: true }).click();

  await expect(page.getByText("From your saved recipes: Bigger bowl")).toBeVisible();

  await page.goto("/");
  await page.getByRole("button", { name: "New meal" }).click();
  await page.waitForURL(/\/meals\/[^/]+\/capture$/);
  await page.getByRole("button", { name: "Use one of your recipes" }).click();
  // ^-anchored: unanchored also catches this row's own "Rename"/"Delete"
  // controls, same reason the picker's other tests already anchor this.
  await expect(page.getByRole("button", { name: /^Chicken rice bowl/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /^Bigger bowl/ })).toBeVisible();
});

test("the fork shows no earlier-meals block when there are none", async ({ page }) => {
  await seedConfidentProduct();
  await signUp(page);
  await logOneIngredient(page);
  await saveCurrentMealAsRecipe(page, "Chicken rice bowl");

  await page.getByRole("button", { name: "Edit this recipe" }).click();
  await page.getByRole("button", { name: "Continue" }).click();

  await expect(page.getByRole("checkbox", { name: /Also update/ })).toHaveCount(0);
  await expect(page.getByText(/was changed after you logged it/)).toHaveCount(0);
});
