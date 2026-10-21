import { expect, test, type Page } from "@playwright/test";

import { db } from "../../src/lib/db";
import { intakeProfiles, weightGoals } from "../../src/lib/db/schema";

import { localToday, signUp, truncateAll } from "./support";

test.beforeEach(truncateAll);

const birthYearAged = (age: number): string => String(new Date().getFullYear() - age);

const openEstimate = async (page: Page): Promise<void> => {
  await page.goto(`/day/${localToday()}`);
  await page.getByRole("button", { name: "Set goal" }).click();
  await page.getByRole("link", { name: /Work out the numbers/ }).click();
  await expect(page.getByRole("heading", { name: "Work out your calories" })).toBeVisible();
};

// The worked case: male, 30, 180 cm, 80 kg, Active, losing weight → 2,090–2,550,
// Use 2,320 (intake.utils.test.ts). Maintain on the same answers: BMR 1,780,
// × 1.55 = 2,759, Use 2,760.
const fillRequired = async (page: Page, age = 30, goal = "Lose weight"): Promise<void> => {
  await page.getByRole("radio", { name: "Male", exact: true }).check();
  await page.getByLabel("Birth year").fill(birthYearAged(age));
  await page.getByLabel("Height").fill("180");
  await page.getByLabel("Current weight").fill("80");
  await page.getByRole("radio", { name: "Active", exact: true }).check();
  await page.getByRole("radio", { name: goal, exact: true }).check();
};

test("leaving the estimate writes nothing", async ({ page }) => {
  await signUp(page);
  await openEstimate(page);
  await fillRequired(page);

  await page.getByRole("link", { name: "Back" }).click();
  await expect(page.getByRole("button", { name: "Set goal" })).toBeVisible();
  expect(await db.select().from(intakeProfiles)).toHaveLength(0);
});

test("the range appears once the required answers are in, and Use sets the goal", async ({ page }) => {
  await signUp(page);
  await openEstimate(page);

  await expect(page.getByText("Fill in 6 more to see your estimate")).toBeVisible();
  await fillRequired(page);
  await expect(page.getByText("2,090–2,550 kcal a day")).toBeVisible();
  await expect(page.getByText(/not medical advice/)).toBeVisible();

  await page.getByRole("button", { name: "Use 2,320" }).click();
  await expect(page.getByRole("button", { name: "Goal: 2,320" })).toBeVisible();
  // Consent was never ticked, so no answers were kept.
  expect(await db.select().from(intakeProfiles)).toHaveLength(0);
});

test("answers are kept only with consent, and come back prefilled", async ({ page }) => {
  await signUp(page);
  await openEstimate(page);
  await fillRequired(page);
  await page.getByLabel("Save my answers so I don't have to enter them again.").check();
  await page.getByRole("button", { name: "Use 2,320" }).click();
  await expect(page.getByRole("button", { name: "Goal: 2,320" })).toBeVisible();

  const [row] = await db.select().from(intakeProfiles);
  expect(row.consentVersion).toBe(2);

  await page.goto("/calories/estimate");
  await expect(page.getByLabel("Birth year")).toHaveValue(birthYearAged(30));
});

test("under-18s get no estimate", async ({ page }) => {
  await signUp(page);
  await openEstimate(page);
  await fillRequired(page, 17);

  await expect(page.getByText(/built for adults/)).toBeVisible();
  await expect(page.getByRole("button", { name: /^Use / })).toHaveCount(0);
});

test("Maintain saves a hold goal from the band, with recomp ticked", async ({ page }) => {
  await signUp(page);
  await openEstimate(page);
  await fillRequired(page, 30, "Maintain");

  // The band starts on the weight sheet's default; 0 would save no goal.
  await expect(page.getByLabel("Band")).toHaveValue("1");
  await page.getByRole("checkbox", { name: "Recomp" }).check();
  await page.getByRole("button", { name: "Use 2,760" }).click();
  await expect(page.getByRole("button", { name: "Goal: 2,760" })).toBeVisible();

  const [goal] = await db.select().from(weightGoals);
  expect(goal).toMatchObject({ mode: "hold", holdBandKg: "1.00", recomp: true, startWeightKg: "80.00" });
});

test("forgetting deletes the stored answers after a confirm", async ({ page }) => {
  await signUp(page);
  await openEstimate(page);
  await fillRequired(page);
  await page.getByLabel("Save my answers so I don't have to enter them again.").check();
  await page.getByRole("button", { name: "Use 2,320" }).click();
  await expect(page.getByRole("button", { name: "Goal: 2,320" })).toBeVisible();

  await page.goto("/calories/estimate");
  await page.getByRole("button", { name: "Forget these details" }).click();
  // Arming alone writes nothing.
  expect(await db.select().from(intakeProfiles)).toHaveLength(1);
  await page.getByRole("button", { name: "Forget", exact: true }).click();
  await expect(page.getByRole("button", { name: "Forget these details" })).toHaveCount(0);
  expect(await db.select().from(intakeProfiles)).toHaveLength(0);
});
