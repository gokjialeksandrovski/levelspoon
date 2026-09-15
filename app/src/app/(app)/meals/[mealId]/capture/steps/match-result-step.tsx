// app/src/app/meals/[mealId]/steps/match-result-step.tsx
import { FOCUS_RING, TAP_HIT_AREA_SM } from "@/components/ui/tap-target";

import type { SelectedProduct, WizardAction } from "../capture-wizard.types";

interface MatchResultStepProps {
  nameGuess: string;
  candidates: SelectedProduct[];
  netWeightText: string | null;
  dispatch: (action: WizardAction) => void;
}

interface CandidateButtonProps {
  candidate: SelectedProduct;
  candidates: SelectedProduct[];
  dispatch: (action: WizardAction) => void;
}

const CandidateButton = ({ candidate, candidates, dispatch }: CandidateButtonProps) => (
  <li>
    <button
      type="button"
      onClick={() =>
        dispatch({
          type: "CANDIDATE_CHOSEN",
          product: candidate,
          alternatives: candidates.filter((other) => other.id !== candidate.id),
        })
      }
      className={`w-full py-3 text-left text-text ${FOCUS_RING}`}
    >
      {candidate.name}
    </button>
  </li>
);

export const MatchResultStep = ({ nameGuess, candidates, netWeightText, dispatch }: MatchResultStepProps) => (
  <div className="flex flex-col gap-4">
    <h2 className="text-lg font-semibold">Which product is this?</h2>
    <ul className="divide-y divide-border">
      {candidates.map((candidate) => (
        <CandidateButton key={candidate.id} candidate={candidate} candidates={candidates} dispatch={dispatch} />
      ))}
    </ul>
    <button
      type="button"
      onClick={() => dispatch({ type: "NONE_OF_THESE", nameGuess, netWeightText })}
      className={`${TAP_HIT_AREA_SM} text-sm text-text-muted underline`}
    >
      <span>None of these</span>
    </button>
  </div>
);
