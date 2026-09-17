import { describe, expect, it } from "vitest";

import { pathReducer, type WizardPath } from "./capture-wizard.path";
import { INITIAL_WIZARD_STEP } from "./capture-wizard.types";

const AMOUNT_STEP = {
  kind: "amount" as const,
  product: {
    id: "p1",
    name: "Olympus Greek Yogurt 2% Fat",
    brand: null,
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

  // Back exits the wizard from a single-step path, so these have to land on
  // the path or Back means "discard this capture".
  it.each([
    { type: "MANUAL_NAME_ENTRY", kind: "product-manual" },
    { type: "BARCODE_ENTRY", kind: "product-barcode" },
  ] as const)("pushes $kind so BACK returns to the entry options", ({ type, kind }) => {
    const entered = pathReducer([INITIAL_WIZARD_STEP], { type, pendingBarcode: null });

    expect(entered).toEqual([INITIAL_WIZARD_STEP, { kind, pendingBarcode: null }]);
    expect(pathReducer(entered, { type: "BACK" })).toEqual([INITIAL_WIZARD_STEP]);
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
