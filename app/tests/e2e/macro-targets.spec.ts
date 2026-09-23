import { expect, test, type Page } from "@playwright/test";

import { localToday, signUp, truncateAll } from "./support";

test.beforeEach(truncateAll);

const openSheet = async (page: Page, pill: string | RegExp) => {
  await page.getByRole("button", { name: pill }).click();
  return page.getByRole("dialog", { name: "Daily goals" });
};

test("shares of a kcal goal save with it, become gram targets, and clear", async ({ page }) => {
  await signUp(page);
  await page.goto(`/day/${localToday()}`);

  const sheet = await openSheet(page, "Set goal");
  await sheet.getByLabel("Daily calorie goal").fill("2100");
  await sheet.getByRole("button", { name: "Add macro targets" }).click();
  await sheet.getByLabel("Protein").fill("30");
  await sheet.getByLabel("Carbs").fill("40");
  await sheet.getByLabel("Fat").fill("25");
  await expect(sheet.getByText("Adds up to 95%, 5% short")).toBeVisible();

  // Three shares that do not fill the day block the whole save, goal included.
  await sheet.getByRole("button", { name: "Save goals" }).click();
  await expect(sheet.getByText(/Fix the macro targets above/)).toBeVisible();
  await expect(sheet).toBeVisible();

  await sheet.getByLabel("Fat").fill("30");
  await expect(sheet.getByText("158g a day")).toBeVisible();
  await sheet.getByRole("button", { name: "Save goals" }).click();
  await expect(sheet).toBeHidden();

  // 2100 kcal at 30/40/30 and 4/4/9 kcal per gram. Shown on an empty day too.
  await expect(page.getByText("of 158g")).toBeVisible();
  await expect(page.getByText("of 210g")).toBeVisible();
  await expect(page.getByText("of 70g")).toBeVisible();

  // Survives a reload, so it came from the database, not local state.
  await page.reload();
  await expect(page.getByText("of 158g")).toBeVisible();

  const reopened = await openSheet(page, /Goal: 2,100/);
  await expect(reopened.getByLabel("Protein")).toHaveValue("30");
  await reopened.getByRole("button", { name: "Clear" }).click();
  await expect(reopened.getByRole("button", { name: "Add macro targets" })).toBeVisible();
  await reopened.getByRole("button", { name: "Save goals" }).click();
  await expect(reopened).toBeHidden();
  await expect(page.getByText("of 158g")).toHaveCount(0);
});

test("one macro tracked in grams with no kcal goal, and back to a share", async ({ page }) => {
  await signUp(page);
  await page.goto(`/day/${localToday()}`);

  const sheet = await openSheet(page, "Set goal");
  await sheet.getByLabel("Daily calorie goal").fill("2000");
  await sheet.getByRole("button", { name: "Add macro targets" }).click();
  await sheet.getByLabel("Protein").fill("30");
  await expect(sheet.getByText("70% left for carbs and fat")).toBeVisible();

  // Removing the goal turns the share into grams of the goal it came from.
  await sheet.getByRole("button", { name: "No calorie goal" }).click();
  await expect(sheet.getByLabel("Protein")).toHaveValue("150");
  await expect(sheet.getByText("Not tracked")).toHaveCount(2);
  await sheet.getByRole("button", { name: "Save goals" }).click();
  await expect(sheet).toBeHidden();

  await expect(page.getByText("of 150g")).toBeVisible();
  await expect(page.getByText("no target")).toHaveCount(2);
  await expect(page.getByRole("button", { name: "Goals", exact: true })).toBeVisible();

  const reopened = await openSheet(page, "Goals");
  await expect(reopened.getByText("No calorie goal", { exact: true })).toBeVisible();
  await reopened.getByRole("button", { name: "Set a calorie goal" }).click();
  await expect(reopened.getByLabel("Protein")).toHaveValue("30");
});
