import { expect, test, type Page } from "@playwright/test";

import { MOCK_UNAVAILABLE_MARKER } from "../../src/lib/meal-estimate/mock-provider";
import { signUp, truncateAll } from "./support";

test.beforeEach(truncateAll);

const DESCRIPTION = "chicken with rice and some olive oil";
// Counts the item tag's own rendered text (" · AI estimate"): the bare
// substring also matches the recipe subtitle's "(AI estimate)".
const ITEM_TAG = "· AI estimate";
const FOLLOW_UP = "Rough estimate. Not right?";

const openLazyTrack = async (page: Page) => {
  await page.getByRole("button", { name: "New meal" }).click();
  await page.waitForURL(/\/meals\/[^/]+\/capture$/);
  await page.getByRole("button", { name: /Lazy track/ }).click();
};

const describeAndEstimate = async (page: Page, text = DESCRIPTION) => {
  await page.getByLabel("What did you eat, and what was in it?").fill(text);
  await page.getByRole("button", { name: "Estimate" }).click();
};

const estimateWithConsent = async (page: Page) => {
  await signUp(page);
  await openLazyTrack(page);
  await describeAndEstimate(page);
  await page.getByRole("button", { name: "I agree" }).click();
  await page.waitForURL(/\/meals\/[^/]+\?estimate=/);
};

test("describe, consent, land on the meal page with the guess logged", async ({ page }) => {
  await signUp(page);
  await openLazyTrack(page);
  await expect(page.getByText(/Least accurate way to log/)).toBeVisible();
  await describeAndEstimate(page);
  await page.getByRole("button", { name: "I agree" }).click();

  await page.waitForURL(/\/meals\/[^/]+\?estimate=/);
  await expect(page.getByText(ITEM_TAG)).toHaveCount(3);
  await expect(page.getByText(FOLLOW_UP)).toBeVisible();
  await expect(page.getByRole("link", { name: /Correct values/ })).toHaveCount(0);

  await page.getByRole("button", { name: "Save as recipe" }).click();
  await page.getByLabel("Name", { exact: true }).fill("Chicken rice bowl");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByText("From your saved recipes: Chicken rice bowl (AI estimate)")).toBeVisible();
});

test("Undo takes the whole guess back", async ({ page }) => {
  await estimateWithConsent(page);

  await page.getByRole("button", { name: "Undo" }).click();

  await expect(page.getByText(ITEM_TAG)).toHaveCount(0);
  await expect(page.getByText(FOLLOW_UP)).toHaveCount(0);
});

test("Describe again replaces the guess, keeps the text, asks no consent twice", async ({ page }) => {
  await estimateWithConsent(page);

  await page.getByRole("link", { name: "Describe again" }).click();
  await expect(page.getByLabel("What did you eat, and what was in it?")).toHaveValue(DESCRIPTION);
  await expect(page.getByText(/This replaces the estimate you just logged/)).toBeVisible();
  await page.getByRole("button", { name: "Estimate" }).click();

  await page.waitForURL(/\/meals\/[^/]+\?estimate=/);
  await expect(page.getByText(ITEM_TAG)).toHaveCount(3);
});

test("editing a guess hides the follow-up", async ({ page }) => {
  await estimateWithConsent(page);

  await page.getByRole("button", { name: "Edit Olive oil amount" }).click();
  await page.getByLabel("Amount", { exact: true }).fill("20");
  await page.getByRole("button", { name: "Save", exact: true }).click();

  await expect(page.getByText(FOLLOW_UP)).toHaveCount(0);
});

test("declining consent sends nothing", async ({ page }) => {
  await signUp(page);
  await openLazyTrack(page);
  const posts: string[] = [];
  page.on("request", (request) => {
    if (request.method() === "POST") posts.push(request.url());
  });

  await describeAndEstimate(page);
  await page.getByRole("button", { name: "Not now" }).click();

  await expect(page.getByLabel("What did you eat, and what was in it?")).toHaveValue(DESCRIPTION);
  expect(posts).toHaveLength(0);
});

test("unavailable keeps text and logs nothing", async ({ page }) => {
  await signUp(page);
  await openLazyTrack(page);
  const text = `chicken with rice ${MOCK_UNAVAILABLE_MARKER}`;
  await describeAndEstimate(page, text);
  await page.getByRole("button", { name: "I agree" }).click();

  await expect(
    page.getByText("Estimate unavailable right now. Your text is kept — try again, or add items by search."),
  ).toBeVisible();
  await expect(page.getByLabel("What did you eat, and what was in it?")).toHaveValue(text);
});

test("Estimate stays disabled with no text and no photo", async ({ page }) => {
  await signUp(page);
  await openLazyTrack(page);
  await expect(page.getByRole("button", { name: "Estimate" })).toBeDisabled();
});
