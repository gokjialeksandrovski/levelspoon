import { INITIAL_WIZARD_STEP, wizardReducer, type WizardAction, type WizardStep } from "./capture-wizard.types";

// History wrapper around `wizardReducer` (stays a pure current-step-only
// reducer): "Back" needs the prior steps kept, not just the current one.
export type WizardPath = WizardStep[]; // non-empty; last element is the current step
export type PathAction = WizardAction | { type: "BACK" };

/** "Describe again" from the meal page opens on the describe step, with the
 * options screen under it so Back still reaches every other way in. */
export const initialWizardPath = (reestimate: string | null): WizardPath =>
  reestimate === null ? [INITIAL_WIZARD_STEP] : [INITIAL_WIZARD_STEP, { kind: "lazy-describe", description: reestimate, replacing: true }];

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
  // A barcode neither source knows lands back on the entry options it was
  // photographed from, so it replaces that step rather than stacking a second
  // copy of it that "Back" would pop to with nothing visibly changed.
  if (action.type === "BARCODE_SCANNED" && action.result.kind === "not_found") {
    return [...path.slice(0, -1), wizardReducer(path[path.length - 1], action)];
  }
  // The same step with new portion figures, not a step forward - appending
  // would leave Back pointing at the weights the user just replaced.
  if (action.type === "PORTIONS_UPDATED") {
    return [...path.slice(0, -1), wizardReducer(path[path.length - 1], action)];
  }
  return [...path, wizardReducer(path[path.length - 1], action)];
};
