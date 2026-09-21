// app/tests/e2e/weight-goal.spec.ts
import { expect, test } from "@playwright/test";

import { todayLocalDateString } from "../../src/lib/date/day-bounds";

import { signUp, truncateAll } from "./support";

const localToday = () => todayLocalDateString(Intl.DateTimeFormat().resolvedOptions().timeZone);

test.beforeEach(truncateAll);

const setTargetGoal = async (page: import("@playwright/test").Page): Promise<void> => {
  await page.getByRole("button", { name: /Track a weight goal/ }).click();
  await page.getByLabel("Current weight").fill("84.8");
  await page.getByLabel("Target weight").fill("72");
  await page.getByRole("button", { name: "0.5 kg/wk" }).click();
  await page.getByRole("button", { name: "Weekly" }).click();
  await page.getByRole("button", { name: "Save goal" }).click();
};

test("a weight goal is optional - the day works without one", async ({ page }) => {
  await signUp(page);
  await page.goto(`/day/${localToday()}`);

  await expect(page.getByRole("button", { name: /Track a weight goal/ })).toBeVisible();
  await expect(page.getByRole("button", { name: "New meal" })).toBeEnabled();
});

test("setting a goal puts one line and a rail on the day", async ({ page }) => {
  await signUp(page);
  await page.goto(`/day/${localToday()}`);
  await setTargetGoal(page);

  const row = page.getByRole("button", { name: "Weight goal" });
  await expect(row).toContainText("84.8 kg");
  await expect(row).toContainText("12.8 to go");
  await expect(row).toContainText("0.5 kg/wk");
  // No calorie figure may appear in this block, ever.
  await expect(row).not.toContainText("kcal");
});

test("the panel states the countdown to the next weigh-in", async ({ page }) => {
  await signUp(page);
  await page.goto(`/day/${localToday()}`);
  await setTargetGoal(page);

  await page.getByRole("button", { name: "Weight goal" }).click();
  const main = page.locator("#main-content");
  await expect(main).toContainText(/Next weigh-in \w+ · in \d+ (day|days|hour|hours)/);
  await expect(main).toContainText("target 72 kg");
});

test("the sheet closes on Escape without writing a goal", async ({ page }) => {
  await signUp(page);
  await page.goto(`/day/${localToday()}`);

  await page.getByRole("button", { name: /Track a weight goal/ }).click();
  await page.getByLabel("Current weight").fill("84.8");
  await page.keyboard.press("Escape");
  await page.reload();

  await expect(page.getByRole("button", { name: /Track a weight goal/ })).toBeVisible();
});

test("the weigh-in prompt can be left without logging anything", async ({ page }) => {
  await signUp(page);
  await page.goto(`/day/${localToday()}`);
  await setTargetGoal(page);

  // The panel's own "Log weight" opens the same prompt a due check-in shows,
  // which is what makes the exit testable on a goal created today.
  await page.getByRole("button", { name: "Weight goal" }).click();
  await page.getByRole("button", { name: "Log weight" }).click();
  await expect(page.getByLabel("Weigh-in due today")).toBeVisible();

  await page.getByRole("button", { name: "Not now" }).click();
  await expect(page.getByRole("button", { name: "Weight goal" })).toBeVisible();
  // Nothing was written: the reading is still the one the goal was set with.
  await page.reload();
  await expect(page.getByRole("button", { name: "Weight goal" })).toContainText("84.8 kg");
});

test("a logged reading moves the row and the countdown", async ({ page }) => {
  await signUp(page);
  await page.goto(`/day/${localToday()}`);
  await setTargetGoal(page);

  await page.getByRole("button", { name: "Weight goal" }).click();
  await page.getByRole("button", { name: "Log weight" }).click();
  await page.getByLabel("Weigh-in due today").fill("78,4");
  await page.getByRole("button", { name: "Log" }).click();

  const row = page.getByRole("button", { name: "Weight goal" });
  await expect(row).toContainText("78.4 kg");
  await expect(row).toContainText("6.4 to go");
});
