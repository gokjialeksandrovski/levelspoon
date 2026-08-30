// app/src/app/meals/[mealId]/steps/match-result-step.tsx
import type { SelectedProduct, WizardAction } from "../capture-wizard.types";

interface MatchResultStepProps {
  nameGuess: string;
  candidates: SelectedProduct[];
  dispatch: (action: WizardAction) => void;
}

export const MatchResultStep = ({ nameGuess, candidates, dispatch }: MatchResultStepProps) => (
  <div className="flex flex-col gap-3">
    <h2 className="font-medium">Which product is this?</h2>
    <ul className="flex flex-col gap-2">
      {candidates.map((candidate) => (
        <li key={candidate.id}>
          <button
            type="button"
            onClick={() =>
              dispatch({
                type: "CANDIDATE_CHOSEN",
                product: candidate,
                alternatives: candidates.filter((other) => other.id !== candidate.id),
              })
            }
            className="w-full rounded border px-3 py-2 text-left"
          >
            {candidate.name}
          </button>
        </li>
      ))}
    </ul>
    <button type="button" onClick={() => dispatch({ type: "NONE_OF_THESE", nameGuess })} className="text-sm text-blue-600">
      None of these
    </button>
  </div>
);
