import { describe, expect, it } from "vitest";

import { pathReducer, type WizardPath } from "./capture-wizard.path";
import { INITIAL_WIZARD_STEP } from "./capture-wizard.types";

const AMOUNT_STEP = {
  kind: "amount" as const,
  product: {
    id: "p1",
    name: "Olympus Greek Yogurt 2% Fat",
    brand: null,
    portions: [],
    densityGMl: null,
    servingUnit: null,
    servingGrams: null,
    nutritionBasisUnit: "g",
    nutritionBasisQuantity: 100,
    // Opaque: these tests assert path push/pop, not arithmetic.
    nutritionPerBasis: {} as never,
  },
  alternatives: [],
  pendingBarcode: null,
};

// Same seven fields the other reducer test files use for opaque nutrition
// figures - these tests assert routing, not arithmetic.
const EXTERNAL_FIGURES = {
  energyKcal: 250, fatG: 10, saturatesG: 3, carbohydrateG: 30, sugarsG: 12, proteinG: 6, saltG: 0.5, fibreG: null,
};

// A ProductCandidate-shaped fixture, matching what applyBarcodeScanned's
// external_match branch maps through toSelectedProduct.
const EXISTING_CANDIDATE = {
  id: "p2",
  name: "Snickers Bar",
  brand: null,
  portions: [],
  nutritionPer100g: EXTERNAL_FIGURES,
  nutritionPhotoKey: null,
  densityGMl: null,
  servingUnit: null,
  servingGrams: null,
  nutritionBasisUnit: "g",
  nutritionBasisQuantity: 100,
};

describe("pathReducer", () => {
  it("appends the next step for a forward action", () => {
    const next = pathReducer([INITIAL_WIZARD_STEP], {
      type: "CANDIDATE_CHOSEN",
      product: AMOUNT_STEP.product,
      alternatives: [],
      pendingBarcode: null,
    });

    expect(next).toEqual([INITIAL_WIZARD_STEP, AMOUNT_STEP]);
  });

  it("pops the last step on BACK", () => {
    const path: WizardPath = [INITIAL_WIZARD_STEP, AMOUNT_STEP];

    expect(pathReducer(path, { type: "BACK" })).toEqual([INITIAL_WIZARD_STEP]);
  });

  it("leaves a single-step path untouched on BACK", () => {
    const path: WizardPath = [INITIAL_WIZARD_STEP];

    expect(pathReducer(path, { type: "BACK" })).toBe(path);
  });

  // Back exits the wizard from a single-step path, so this has to land on
  // the path or Back means "discard this capture".
  it("pushes product-manual so BACK returns to the entry options", () => {
    const entered = pathReducer([INITIAL_WIZARD_STEP], { type: "MANUAL_NAME_ENTRY", pendingBarcode: null });

    expect(entered).toEqual([INITIAL_WIZARD_STEP, { kind: "product-manual", pendingBarcode: null }]);
    expect(pathReducer(entered, { type: "BACK" })).toEqual([INITIAL_WIZARD_STEP]);
  });

  // The barcode row lives on the entry options, so an unrecognised code has
  // nowhere forward to go - it re-renders the step the user is already on.
  it("replaces the entry step for a barcode neither source knows", () => {
    const scanned = pathReducer([INITIAL_WIZARD_STEP], {
      type: "BARCODE_SCANNED",
      result: { kind: "not_found", barcode: "0000000000000" },
    });

    expect(scanned).toEqual([{ kind: "product-photo", pendingBarcode: "0000000000000" }]);
  });

  it("carries Open Food Facts duplicate suggestions onto the confirm step", () => {
    const path = pathReducer([INITIAL_WIZARD_STEP], {
      type: "BARCODE_SCANNED",
      result: {
        kind: "external_match",
        barcode: "5000159461122",
        nameGuess: "Snickers",
        nutritionPer100g: EXTERNAL_FIGURES,
        nutritionBasisUnit: "g",
        netWeightText: null,
        flags: [],
        duplicates: [EXISTING_CANDIDATE],
      },
    });
    const step = path[path.length - 1];
    expect(step.kind === "confirm" && step.duplicates.map((row) => row.name)).toEqual(["Snickers Bar"]);
  });

  it("carries a pending barcode into manual entry", () => {
    const step = { kind: "product-photo" as const, pendingBarcode: "0000000000000" };

    expect(pathReducer([step], { type: "MANUAL_NAME_ENTRY", pendingBarcode: step.pendingBarcode })).toEqual([
      step,
      { kind: "product-manual", pendingBarcode: "0000000000000" },
    ]);
  });

  it("resets to the initial step on ADD_ANOTHER regardless of depth", () => {
    const path: WizardPath = [INITIAL_WIZARD_STEP, AMOUNT_STEP, { kind: "saved" }];

    expect(pathReducer(path, { type: "ADD_ANOTHER" })).toEqual([INITIAL_WIZARD_STEP]);
  });

  it("discards the preceding path on SAVED so BACK can't walk back into the saved step", () => {
    const path: WizardPath = [INITIAL_WIZARD_STEP, AMOUNT_STEP];
    const saved = pathReducer(path, { type: "SAVED" });

    expect(saved).toEqual([{ kind: "saved" }]);
    expect(pathReducer(saved, { type: "BACK" })).toEqual([{ kind: "saved" }]);
  });
});
