import { expect, test, type Page } from "@playwright/test";

import { logOneIngredient, seedConfidentProduct, signUp, truncateAll } from "./support";

const NAME = "Olympus Greek Yogurt 2% Fat";

test.beforeEach(truncateAll);

const startOnMeal = async (page: Page) => {
  await seedConfidentProduct();
  await signUp(page);
  await logOneIngredient(page);
};

// Server Actions are POSTs, so a copy control that sends nothing leaves this empty.
const recordPosts = (page: Page): string[] => {
  const posts: string[] = [];
  page.on("request", (request) => {
    if (request.method() === "POST") posts.push(request.url());
  });
  return posts;
};

test("row Copy toggles and sends no request", async ({ page }) => {
  await startOnMeal(page);
  const copy = page.getByRole("button", { name: `Copy ${NAME}`, exact: true });
  await expect(copy).toBeVisible();
  const posts = recordPosts(page);

  await copy.click();
  const copied = page.getByRole("button", { name: `Copied ${NAME}`, exact: true });
  await expect(copied).toHaveText("Copied");

  await copied.click();
  await expect(page.getByRole("button", { name: `Copy ${NAME}`, exact: true })).toBeVisible();
  expect(posts).toEqual([]);
});

test("Copy meal copies every row and toggles back", async ({ page }) => {
  await startOnMeal(page);

  await page.getByRole("button", { name: "Copy meal", exact: true }).click();
  await expect(page.getByRole("button", { name: "Copied", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: `Copied ${NAME}`, exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Copied", exact: true }).click();
  await expect(page.getByRole("button", { name: `Copy ${NAME}`, exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Copy meal", exact: true })).toBeVisible();
});

test("Copy is hidden while the row is edited", async ({ page }) => {
  await startOnMeal(page);
  const copy = page.getByRole("button", { name: `Copy ${NAME}`, exact: true });
  await expect(copy).toBeVisible();

  await page.getByRole("button", { name: `Edit ${NAME} amount` }).click();

  await expect(copy).toHaveCount(0);
});

test("copied state survives reload", async ({ page }) => {
  await startOnMeal(page);
  await page.getByRole("button", { name: `Copy ${NAME}`, exact: true }).click();

  await page.reload();

  await expect(page.getByRole("button", { name: `Copied ${NAME}`, exact: true })).toBeVisible();
});

test("row actions fit a 320 px screen", async ({ page }) => {
  await startOnMeal(page);
  await page.setViewportSize({ width: 320, height: 640 });

  const boxes = await Promise.all(
    [`Edit ${NAME} amount`, `Copy ${NAME}`, `Remove ${NAME}`].map(async (name) => {
      const box = await page.getByRole("button", { name, exact: true }).boundingBox();
      if (!box) throw new Error(`${name} has no box`);
      return box;
    }),
  );

  for (const box of boxes) expect(box.x + box.width).toBeLessThanOrEqual(320);
  const [edit, copy, remove] = boxes;
  expect(edit.x + edit.width).toBeLessThanOrEqual(copy.x);
  expect(copy.x + copy.width).toBeLessThanOrEqual(remove.x);
});

const copyRow = async (page: Page) => {
  await page.getByRole("button", { name: `Copy ${NAME}`, exact: true }).click();
  await expect(page.getByRole("button", { name: `Copied ${NAME}`, exact: true })).toBeVisible();
};

const startNewMeal = async (page: Page) => {
  await page.goto("/");
  await page.getByRole("button", { name: "New meal" }).click();
  await page.waitForURL(/\/meals\/[^/]+\/capture$/);
};

const copiedTray = (page: Page) => page.getByRole("region", { name: "Copied ingredients" });

// The tray is closed until asked for; its trigger names the list ("Copied 1 ingredient · 470 kcal").
const trayTrigger = (page: Page) => page.getByRole("button", { name: /^Copied\s?\d+ ingredients?/ });

const openTray = async (page: Page) => {
  await expect(trayTrigger(page)).toHaveAttribute("aria-expanded", "false");
  await trayTrigger(page).click();
};

test("paste from capture options lands on the meal with the row", async ({ page }) => {
  await startOnMeal(page);
  const sourceUrl = page.url();
  await copyRow(page);
  await startNewMeal(page);

  await expect(copiedTray(page)).toBeVisible();
  const trayBox = await copiedTray(page).boundingBox();
  const barcodeBox = await page.getByText("Scan the barcode").boundingBox();
  expect(trayBox!.y).toBeLessThan(barcodeBox!.y);

  await openTray(page);
  await expect(copiedTray(page).getByText(/200 ?g/)).toBeVisible();
  await page.getByRole("button", { name: "Paste", exact: true }).click();

  await page.waitForURL(/\/meals\/[^/]+$/);
  expect(page.url()).not.toBe(sourceUrl);
  await expect(page.getByRole("heading", { name: "Meal 2" })).toBeVisible();
  await expect(page.getByRole("button", { name: `Remove ${NAME}`, exact: true })).toHaveCount(1);
});

test("paste on the meal page adds a second row and keeps the list, folded", async ({ page }) => {
  await startOnMeal(page);
  await copyRow(page);

  await openTray(page);
  await page.getByRole("button", { name: "Paste", exact: true }).click();

  await expect(page.getByRole("button", { name: `Remove ${NAME}`, exact: true })).toHaveCount(2);
  await expect(copiedTray(page)).toBeVisible();
  await expect(trayTrigger(page)).toHaveAttribute("aria-expanded", "false");
});

// Holds every request the pattern matches until the returned release runs,
// so a test can look at the screen while the write or navigation is in flight.
const holdRequests = async (page: Page, pattern: RegExp, method: string): Promise<() => void> => {
  let release = () => {};
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route(pattern, async (route) => {
    if (route.request().method() === method) await held;
    await route.continue();
  });
  return release;
};

// Next runs Server Actions one at a time, so without the pending guard a
// second tap queues a second write rather than racing the first: the row
// count alone would pass on its way from 2 to 3. The disabled check while
// the first write is held is what fails without the guard.
test("double-tapping Paste writes once", async ({ page }) => {
  await startOnMeal(page);
  await copyRow(page);
  const releaseWrite = await holdRequests(page, /\/meals\/[^/?]+$/, "POST");
  const posts = recordPosts(page);
  const paste = page.getByRole("button", { name: "Paste", exact: true });

  await openTray(page);
  await paste.dblclick();
  await expect(paste).toBeDisabled();
  releaseWrite();

  await expect(trayTrigger(page)).toHaveAttribute("aria-expanded", "false");
  await expect(page.getByRole("button", { name: `Remove ${NAME}`, exact: true })).toHaveCount(2);
  expect(posts).toHaveLength(1);
});

test("Paste on capture stays pending until the meal page opens", async ({ page }) => {
  await startOnMeal(page);
  await copyRow(page);
  await startNewMeal(page);
  const releaseNavigation = await holdRequests(page, /\/meals\/[^/?]+\?_rsc=/, "GET");
  const paste = page.getByRole("button", { name: "Paste", exact: true });

  await openTray(page);
  await paste.click();
  await expect(page.getByRole("status").filter({ hasText: "1 ingredient pasted." })).toHaveCount(1);
  await expect(paste).toBeDisabled();
  releaseNavigation();

  await page.waitForURL(/\/meals\/[^/]+$/);
});

test("a repeated paste is announced again", async ({ page }) => {
  await startOnMeal(page);
  await copyRow(page);
  const paste = page.getByRole("button", { name: "Paste", exact: true });
  const pasted = page.getByRole("status").filter({ hasText: "1 ingredient pasted." });

  await openTray(page);
  await paste.click();
  await expect(pasted).toHaveCount(1);
  await expect(pasted).toHaveCount(0, { timeout: 10_000 });
  await openTray(page);
  await paste.click();

  await expect(pasted).toHaveCount(1);
});

test("× and Clear with Undo send no request", async ({ page }) => {
  await startOnMeal(page);
  await copyRow(page);
  await startNewMeal(page);
  const posts = recordPosts(page);

  await openTray(page);
  await page.getByRole("button", { name: "Clear", exact: true }).click();
  await expect(page.getByText("Copied list cleared", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Undo" }).click();
  await expect(trayTrigger(page)).toHaveAttribute("aria-expanded", "true");

  await page.getByRole("button", { name: `Take ${NAME} off copied list`, exact: true }).click();
  await expect(copiedTray(page)).toHaveCount(0);
  expect(posts).toEqual([]);
});

// Seeded straight into storage, not copied fifty times: a full list is the
// starting state this test needs, not the thing it tests.
const fillCopiedList = async (page: Page) => {
  await page.evaluate(async () => {
    const session = await fetch("/api/auth/session").then((response) => response.json());
    const entries = Array.from({ length: 50 }, (_, index) => ({
      sourceIngredientId: `seeded-${index}`,
      productId: crypto.randomUUID(),
      productName: "Seeded",
      quantity: 10,
      quantityUnit: "g",
      entryCount: null,
      entryUnit: null,
      quantitySource: "manual",
      energyKcal: 1,
      isAiEstimate: false,
    }));
    localStorage.setItem(`levelspoon:copied:${session.user.id}`, JSON.stringify(entries));
  });
  await page.reload();
};

test("a full copied list refuses another copy until it has room", async ({ page }) => {
  await startOnMeal(page);
  await fillCopiedList(page);
  const copy = page.getByRole("button", { name: `Copy ${NAME}`, exact: true });
  // Not the live region, which says the same words to a screen reader.
  const notice = page.locator("p:not([role=status])", { hasText: /holds 50 ingredients at most/ });

  await copy.click();
  await expect(notice).toBeVisible();
  await expect(copy).toBeVisible();
  await page.getByRole("button", { name: "Copy meal", exact: true }).click();
  await expect(trayTrigger(page)).toContainText("50 ingredients");

  await openTray(page);
  await page.getByRole("button", { name: "Take Seeded off copied list", exact: true }).first().click();
  await expect(notice).toHaveCount(0);
  await copy.click();
  await expect(page.getByRole("button", { name: `Copied ${NAME}`, exact: true })).toBeVisible();
});

test("copied list shows after a hard reload of capture", async ({ page }) => {
  await startOnMeal(page);
  await copyRow(page);
  await startNewMeal(page);

  await page.reload();

  await expect(copiedTray(page)).toBeVisible();
});
