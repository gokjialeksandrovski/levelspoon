// app/src/app/(app)/meals/[mealId]/capture/capture-wizard.path.test.ts
import { describe, expect, it } from "vitest";

import { pathReducer, type WizardPath } from "./capture-wizard.path";
import { INITIAL_WIZARD_STEP } from "./capture-wizard.types";

const AMOUNT_STEP = {
  kind: "amount" as const,
  product: { id: "p1", name: "Olympus Greek Yogurt 2% Fat" },
  alternatives: [],
};

describe("pathReducer", () => {
  it("appends the next step for a forward action", () => {
    const next = pathReducer([INITIAL_WIZARD_STEP], {
      type: "CANDIDATE_CHOSEN",
      product: AMOUNT_STEP.product,
      alternatives: [],
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
