// app/src/app/meals/[mealId]/steps/match-result-step.tsx
import type { SelectedProduct, WizardAction } from "../capture-wizard.types";

interface MatchResultStepProps {
  nameGuess: string;
  candidates: SelectedProduct[];
  dispatch: (action: WizardAction) => void;
}

export const MatchResultStep = ({ nameGuess, candidates, dispatch }: MatchResultStepProps) => (
  <div className="flex flex-col gap-4">
    <h2 className="text-lg font-semibold">Which product is this?</h2>
    <ul className="divide-y divide-border">
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
            className="w-full py-3 text-left text-text"
          >
            {candidate.name}
          </button>
        </li>
      ))}
    </ul>
    <button
      type="button"
      onClick={() => dispatch({ type: "NONE_OF_THESE", nameGuess })}
      className="text-sm text-text-muted underline"
    >
      None of these
    </button>
  </div>
);
