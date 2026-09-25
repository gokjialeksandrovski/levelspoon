import { expect, test, type Page } from "@playwright/test";

import { MOCK_UNAVAILABLE_MARKER } from "../../src/lib/meal-estimate/mock-provider";
import { signUp, truncateAll } from "./support";

test.beforeEach(truncateAll);

const openLazyTrack = async (page: Page) => {
  await page.getByRole("button", { name: "New meal" }).click();
  await page.waitForURL(/\/meals\/[^/]+\/capture$/);
  await page.getByRole("button", { name: /Lazy track/ }).click();
};

const describeAndEstimate = async (page: Page, text = "chicken with rice and some olive oil") => {
  await page.getByLabel("What did you eat, and what was in it?").fill(text);
  await page.getByRole("button", { name: "Estimate" }).click();
};

test("describe, consent, adjust, log, save as recipe from the meal page", async ({ page }) => {
  await signUp(page);
  await openLazyTrack(page);

  await describeAndEstimate(page);
  await page.getByRole("button", { name: "I agree" }).click();

  await expect(page.getByRole("heading", { name: "Chicken rice bowl" })).toBeVisible();
  await page.getByLabel(/, grams$/).nth(1).fill("150");
  await page.getByRole("button", { name: "Remove Olive oil" }).click();
  await page.getByRole("button", { name: "Log" }).click();

  await page.waitForURL(/\/meals\/[^/]+$/);
  await page.getByRole("button", { name: "Save as recipe" }).click();
  await page.getByLabel("Name", { exact: true }).fill("Chicken rice bowl");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  // Substring "AI estimate" also matches the recipe subtitle's "(AI estimate)",
  // so this counts the item tag's own rendered text (" · AI estimate"), not
  // every occurrence of the substring on the page (controller ruling 1).
  await expect(page.getByText("· AI estimate")).toHaveCount(2);
  await expect(page.getByText("From your saved recipes: Chicken rice bowl (AI estimate)")).toBeVisible();
  await expect(page.getByRole("link", { name: /Correct values/ })).toHaveCount(0);
});

test("a second estimate does not ask for consent again", async ({ page }) => {
  await signUp(page);
  await openLazyTrack(page);
  await describeAndEstimate(page);
  await page.getByRole("button", { name: "I agree" }).click();
  await page.getByRole("button", { name: "Add detail" }).click();

  await expect(page.getByLabel("What did you eat, and what was in it?")).toHaveValue("chicken with rice and some olive oil");
  await page.getByRole("button", { name: "Estimate" }).click();
  await expect(page.getByRole("heading", { name: "Chicken rice bowl" })).toBeVisible();
});

test("Actually, don't add more detail returns to the estimate without a request", async ({ page }) => {
  await signUp(page);
  await openLazyTrack(page);
  await describeAndEstimate(page);
  await page.getByRole("button", { name: "I agree" }).click();
  await page.getByRole("button", { name: "Add detail" }).click();

  const posts: string[] = [];
  page.on("request", (request) => {
    if (request.method() === "POST") posts.push(request.url());
  });
  await page.getByRole("button", { name: "Actually, don't add more detail" }).click();

  await expect(page.getByRole("heading", { name: "Chicken rice bowl" })).toBeVisible();
  expect(posts).toHaveLength(0);
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

  await expect(page.getByLabel("What did you eat, and what was in it?")).toHaveValue("chicken with rice and some olive oil");
  expect(posts).toHaveLength(0);
});

test("Escape on review writes nothing and keeps the text", async ({ page }) => {
  await signUp(page);
  await openLazyTrack(page);
  await describeAndEstimate(page);
  await page.getByRole("button", { name: "I agree" }).click();
  // No .focus() on a Grams field first (controller ruling 2): this covers the
  // arrival case - Escape fired right after the review step mounts, with
  // nothing on it yet given focus - which is the bug the document-level
  // keydown listener (vs. a since-removed div onKeyDown) was fixed for.
  await expect(page.getByRole("heading", { name: "Chicken rice bowl" })).toBeVisible();

  const posts: string[] = [];
  page.on("request", (request) => {
    if (request.method() === "POST") posts.push(request.url());
  });
  await page.keyboard.press("Escape");

  await expect(page.getByLabel("What did you eat, and what was in it?")).toHaveValue("chicken with rice and some olive oil");
  expect(posts).toHaveLength(0);
});

test("an emptied grams field disables Log", async ({ page }) => {
  await signUp(page);
  await openLazyTrack(page);
  await describeAndEstimate(page);
  await page.getByRole("button", { name: "I agree" }).click();

  await page.getByLabel(/, grams$/).first().fill("");
  await expect(page.getByRole("button", { name: "Log" })).toBeDisabled();
  await expect(page.getByText("Enter an amount above 0.")).toBeVisible();
});

test("unavailable keeps text", async ({ page }) => {
  await signUp(page);
  await openLazyTrack(page);
  const text = `chicken with rice ${MOCK_UNAVAILABLE_MARKER}`;
  await describeAndEstimate(page, text);
  await page.getByRole("button", { name: "I agree" }).click();

  await expect(
    page.getByText("Estimate unavailable right now. Your text is kept, so try again or add items by search."),
  ).toBeVisible();
  await expect(page.getByLabel("What did you eat, and what was in it?")).toHaveValue(text);
});

test("Estimate stays disabled with no text and no photo", async ({ page }) => {
  await signUp(page);
  await openLazyTrack(page);
  await expect(page.getByRole("button", { name: "Estimate" })).toBeDisabled();
});
