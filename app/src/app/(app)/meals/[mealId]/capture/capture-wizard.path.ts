import { INITIAL_WIZARD_STEP, wizardReducer, type WizardAction, type WizardStep } from "./capture-wizard.types";

// History wrapper around `wizardReducer` (stays a pure current-step-only
// reducer): "Back" needs the prior steps kept, not just the current one.
export type WizardPath = WizardStep[]; // non-empty; last element is the current step
export type PathAction = WizardAction | { type: "BACK" };

export const pathReducer = (path: WizardPath, action: PathAction): WizardPath => {
  if (action.type === "BACK") {
    return path.length > 1 ? path.slice(0, -1) : path;
  }
  // Fresh capture, not a step forward - else "Back" could walk into an
  // already-saved amount step.
  if (action.type === "ADD_ANOTHER") {
    return [INITIAL_WIZARD_STEP];
  }
  // Terminal transition: discards path history so Back can't pop back into
  // the just-saved product and invite a duplicate save.
  if (action.type === "SAVED") {
    return [wizardReducer(path[path.length - 1], action)];
  }
  return [...path, wizardReducer(path[path.length - 1], action)];
};
