import { describe, expect, it } from "vitest";

import type { MealIngredientDetail } from "@/features/meals/actions/meals";
import { ZERO_NUTRITION } from "@/lib/nutrition/totals";

import {
  copiedStorageKey,
  dropProducts,
  ingredientCount,
  isCopied,
  isMealCopied,
  parseCopied,
  pasteLabel,
  toCopiedIngredient,
  toggleMeal,
  toggleRow,
  toPasteItems,
  unavailableMessage,
} from "./copied-ingredients.utils";

const ingredient = (
  id: string,
  productId: string,
  overrides: Partial<MealIngredientDetail> = {},
): MealIngredientDetail => ({
  id,
  productId,
  productName: "Oats",
  quantity: 80,
  quantityUnit: "g",
  entryCount: null,
  entryUnit: null,
  quantitySource: "manual",
  contribution: { ...ZERO_NUTRITION, energyKcal: 300 },
  densityGMl: null,
  servingUnit: null,
  servingGrams: null,
  nutritionBasisUnit: "g",
  portions: [],
  isAiEstimate: false,
  ...overrides,
});

const oats = ingredient("oats-row", "oats");
const oatsSecondRow = ingredient("oats-second-row", "oats");
const milk = ingredient("milk-row", "milk", { productName: "Milk 2%" });
const banana = ingredient("banana-row", "banana", { productName: "Banana" });
const otherMealRice = ingredient("rice-row", "rice", { productName: "Rice" });

describe("copied ingredients", () => {
  it("keys the list by user", () => {
    expect(copiedStorageKey("u1")).toBe("levelspoon:copied:u1");
    expect(copiedStorageKey(undefined)).toBeNull();
  });

  it("toggles a row in and out, leaving others", () => {
    const added = toggleRow([], oats);
    expect(isCopied(added, oats.id)).toBe(true);
    expect(toggleRow(toggleRow(added, milk), oats).map((item) => item.sourceIngredientId)).toEqual([milk.id]);
  });

  it("keeps the amount it copied when the source row changes", () => {
    const copied = toggleRow([], oats);
    const edited = { ...oats, quantity: 120 };
    expect(isCopied(copied, edited.id)).toBe(true);
    expect(copied[0].quantity).toBe(80);
  });

  it("copy meal adds only rows not yet copied, in meal order", () => {
    const items = toggleMeal(toggleRow([], milk), [oats, milk, banana]);
    expect(items.map((item) => item.sourceIngredientId)).toEqual([milk.id, oats.id, banana.id]);
    expect(isMealCopied(items, [oats, milk, banana])).toBe(true);
  });

  it("copy meal on a fully copied meal drops only that meal's rows", () => {
    const items = toggleMeal(toggleRow([], otherMealRice), [oats, milk]);
    expect(toggleMeal(items, [oats, milk]).map((item) => item.sourceIngredientId)).toEqual([otherMealRice.id]);
  });

  it("an empty meal is never fully copied", () => expect(isMealCopied([], [])).toBe(false));

  it("drops every entry of an unavailable product", () => {
    const items = toggleRow(toggleRow(toggleRow([], oats), oatsSecondRow), milk);
    expect(dropProducts(items, [oats.productId]).map((item) => item.sourceIngredientId)).toEqual([milk.id]);
  });

  it.each([null, "not json", '{"a":1}', "[1,2]"])("reads %s as an empty list", (raw) =>
    expect(parseCopied(raw)).toEqual([]));

  it("keeps well-formed entries and drops malformed ones", () => {
    const good = toCopiedIngredient(oats);
    expect(parseCopied(JSON.stringify([good, { productId: 3 }]))).toEqual([good]);
  });

  it("sends amounts only to the server", () =>
    expect(toPasteItems([toCopiedIngredient(oats)])).toEqual([
      { productId: oats.productId, quantity: 80, quantityUnit: "g", entryCount: null, entryUnit: null, quantitySource: "manual" },
    ]));

  it("labels paste and counts", () => {
    expect(pasteLabel(1)).toBe("Paste");
    expect(pasteLabel(3)).toBe("Paste all 3");
    expect(ingredientCount(1)).toBe("1 ingredient");
    expect(ingredientCount(3)).toBe("3 ingredients");
  });

  it("words the unavailable message by what is left", () => {
    expect(unavailableMessage(1, 0)).toBe("1 copied item is no longer available and was taken off the list.");
    expect(unavailableMessage(2, 0)).toBe("2 copied items are no longer available and were taken off the list.");
    expect(unavailableMessage(2, 1)).toBe(
      "2 copied items are no longer available and were taken off the list. Paste the rest again.",
    );
  });
});
