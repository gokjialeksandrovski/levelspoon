import { Button } from "@/components/ui/button";
import { FOCUS_RING } from "@/components/ui/tap-target";

import type { SelectedProduct, WizardAction } from "../capture-wizard.types";

interface MatchResultStepProps {
  nameGuess: string;
  candidates: SelectedProduct[];
  netWeightText: string | null;
  pendingBarcode: string | null;
  dispatch: (action: WizardAction) => void;
}

interface CandidateButtonProps {
  candidate: SelectedProduct;
  candidates: SelectedProduct[];
  pendingBarcode: string | null;
  dispatch: (action: WizardAction) => void;
}

const CandidateButton = ({ candidate, candidates, pendingBarcode, dispatch }: CandidateButtonProps) => (
  <li>
    <button
      type="button"
      onClick={() =>
        dispatch({
          type: "CANDIDATE_CHOSEN",
          product: candidate,
          alternatives: candidates.filter((other) => other.id !== candidate.id),
          pendingBarcode,
        })
      }
      className={`w-full py-3 text-left text-text ${FOCUS_RING}`}
    >
      {candidate.name}
    </button>
  </li>
);

export const MatchResultStep = ({ nameGuess, candidates, netWeightText, pendingBarcode, dispatch }: MatchResultStepProps) => (
  <div className="flex flex-col gap-4">
    <h2 className="text-lg font-semibold">Which product is this?</h2>
    <ul className="divide-y divide-border">
      {candidates.map((candidate) => (
        <CandidateButton key={candidate.id} candidate={candidate} candidates={candidates} pendingBarcode={pendingBarcode} dispatch={dispatch} />
      ))}
    </ul>
    <Button
      variant="ghost"
      link
      onClick={() => dispatch({ type: "NONE_OF_THESE", nameGuess, netWeightText, pendingBarcode })}
    >
      None of these
    </Button>
  </div>
);
