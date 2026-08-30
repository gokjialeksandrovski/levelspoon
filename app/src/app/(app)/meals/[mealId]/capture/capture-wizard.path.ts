// app/src/app/(app)/meals/[mealId]/capture/capture-wizard.path.ts
import { INITIAL_WIZARD_STEP, wizardReducer, type WizardAction, type WizardStep } from "./capture-wizard.types";

// A thin history wrapper around `wizardReducer`, which stays a pure
// current-step-only reducer: the full-screen wizard route needs a "Back"
// affordance, and the only way to restore a previous step exactly (with its
// candidates, parsed values, photo Blob) is to keep the steps themselves.
export type WizardPath = WizardStep[]; // non-empty; last element is the current step
export type PathAction = WizardAction | { type: "BACK" };

export const pathReducer = (path: WizardPath, action: PathAction): WizardPath => {
  if (action.type === "BACK") {
    return path.length > 1 ? path.slice(0, -1) : path;
  }
  // Starting a second ingredient is a fresh capture, not a step forward -
  // keeping the finished ingredient's steps would let "Back" walk into an
  // already-saved amount step.
  if (action.type === "ADD_ANOTHER") {
    return [INITIAL_WIZARD_STEP];
  }
  return [...path, wizardReducer(path[path.length - 1], action)];
};
