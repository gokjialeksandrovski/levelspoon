// app/src/app/(app)/meals/[mealId]/capture/capture-wizard.tsx
"use client";

import { motion, useReducedMotion } from "motion/react";
import { useRouter } from "next/navigation";
import { useReducer, useState } from "react";

import { discardEmptyMeal } from "@/actions/meals";
import { Button } from "@/components/button";
import { LogSuccessPulse } from "@/components/log-success-pulse";
import { todayLocalDateString } from "@/lib/date/day-bounds";
import { slideInitial, slideTransition } from "@/lib/motion/step-transition";

import { pathReducer, type PathAction } from "./capture-wizard.path";
import { INITIAL_WIZARD_STEP, type WizardStep } from "./capture-wizard.types";
import { AmountStep } from "./steps/amount-step";
import { ConfirmStep } from "./steps/confirm-step";
import { MatchResultStep } from "./steps/match-result-step";
import { NutritionPhotoStep } from "./steps/nutrition-photo-step";
import { ProductNameStep } from "./steps/product-name-step";
import { ServingSizeStep } from "./steps/serving-size-step";
import { WizardShell } from "./wizard-shell";

const STEP_TITLES: Record<WizardStep["kind"], string> = {
  "product-photo": "Product name",
  "match-result": "Which product?",
  "nutrition-photo": "Nutrition label",
  "serving-size": "Serving size",
  confirm: "Confirm values",
  amount: "Amount",
  saved: "Saved",
};

// Approximate, not derived: the wizard's remaining length depends on which
// branch the match takes, so the rail conveys momentum rather than an exact
// step count.
const STEP_PROGRESS: Record<WizardStep["kind"], number> = {
  "product-photo": 0.2,
  "match-result": 0.4,
  "nutrition-photo": 0.5,
  "serving-size": 0.6,
  confirm: 0.75,
  amount: 0.9,
  saved: 1,
};

const SavedStep = ({ dispatch, onDone }: { dispatch: (action: PathAction) => void; onDone: () => void }) => (
  <div className="flex flex-col items-center gap-4 py-8 text-center">
    <p className="text-text">Ingredient saved.</p>
    <div className="flex gap-2">
      <Button variant="primary" onClick={() => dispatch({ type: "ADD_ANOTHER" })}>
        Add another
      </Button>
      <Button variant="ghost" onClick={onDone}>
        Done
      </Button>
    </div>
  </div>
);

const renderProductPhotoStep = (dispatch: (action: PathAction) => void) => <ProductNameStep dispatch={dispatch} />;

const renderMatchResultStep = (
  step: Extract<WizardStep, { kind: "match-result" }>,
  dispatch: (action: PathAction) => void,
) => (
  <MatchResultStep
    nameGuess={step.nameGuess}
    candidates={step.candidates}
    netWeightText={step.netWeightText}
    dispatch={dispatch}
  />
);

const renderNutritionPhotoStep = (
  step: Extract<WizardStep, { kind: "nutrition-photo" }>,
  dispatch: (action: PathAction) => void,
) => <NutritionPhotoStep nameGuess={step.nameGuess} netWeightText={step.netWeightText} dispatch={dispatch} />;

const renderServingSizeStep = (
  step: Extract<WizardStep, { kind: "serving-size" }>,
  dispatch: (action: PathAction) => void,
) => (
  <ServingSizeStep
    servingSizeText={step.servingSizeText}
    perServing={step.perServing}
    name={step.name}
    photo={step.photo}
    prefillGrams={step.prefillGrams}
    dispatch={dispatch}
  />
);

const renderConfirmStep = (
  step: Extract<WizardStep, { kind: "confirm" }>,
  dispatch: (action: PathAction) => void,
) => (
  <ConfirmStep
    name={step.name}
    parsed={step.parsed}
    flags={step.flags}
    photo={step.photo}
    learned={step.learned}
    dispatch={dispatch}
  />
);

const renderAmountStep = (
  step: Extract<WizardStep, { kind: "amount" }>,
  mealId: string,
  dispatch: (action: PathAction) => void,
  onSaved: () => void,
) => (
  <AmountStep
    mealId={mealId}
    product={step.product}
    alternatives={step.alternatives}
    dispatch={dispatch}
    onSaved={onSaved}
  />
);

const renderSavedStep = (dispatch: (action: PathAction) => void, onDone: () => void) => (
  <SavedStep dispatch={dispatch} onDone={onDone} />
);

interface StepViewProps {
  step: WizardStep;
  mealId: string;
  dispatch: (action: PathAction) => void;
  onSaved: () => void;
  onDone: () => void;
}

const StepView = ({ step, mealId, dispatch, onSaved, onDone }: StepViewProps) => {
  switch (step.kind) {
    case "product-photo":
      return renderProductPhotoStep(dispatch);
    case "match-result":
      return renderMatchResultStep(step, dispatch);
    case "nutrition-photo":
      return renderNutritionPhotoStep(step, dispatch);
    case "serving-size":
      return renderServingSizeStep(step, dispatch);
    case "confirm":
      return renderConfirmStep(step, dispatch);
    case "amount":
      return renderAmountStep(step, mealId, dispatch, onSaved);
    case "saved":
      return renderSavedStep(dispatch, onDone);
  }
};

interface AnimatedStepProps {
  stepKind: WizardStep["kind"];
  reduceMotion: boolean | null;
  children: React.ReactNode;
}

const AnimatedStep = ({ stepKind, reduceMotion, children }: AnimatedStepProps) => (
  <motion.div
    key={stepKind}
    initial={slideInitial(reduceMotion)}
    animate={{ opacity: 1, x: 0 }}
    transition={slideTransition(reduceMotion)}
  >
    {children}
  </motion.div>
);

// Leaving the wizard is a real navigation now that it owns a route, so there
// is no in-page listener left to notify: the destination remounts and fetches
// for itself. A meal created by the action bar but never filled in is deleted
// on the way out so it never shows up as an empty row on the day view.
const useWizardExit = (mealId: string, savedCount: number, today: string) => {
  const router = useRouter();

  return async () => {
    if (savedCount > 0) {
      router.push(`/meals/${mealId}`);
      return;
    }
    try {
      await discardEmptyMeal(mealId);
    } catch (error) {
      // Harmless: an ingredient-less meal is invisible on the day view
      // anyway, and createMeal's own sweep collects it on the next attempt.
      console.error("discardEmptyMeal failed", error);
    }
    router.replace(`/day/${today}`);
  };
};

interface UseCaptureWizardResult {
  step: WizardStep;
  dispatch: (action: PathAction) => void;
  handleBack: () => void;
  markSaved: () => void;
  finish: () => void;
  savedCount: number;
}

// Bundles the wizard's own path/save-count state and its exit strategy into
// one hook, purely so CaptureWizard's own body stays under the line budget -
// every value here is still just what CaptureWizard needs to render.
const useCaptureWizard = (mealId: string): UseCaptureWizardResult => {
  const [path, dispatch] = useReducer(pathReducer, [INITIAL_WIZARD_STEP]);
  const [savedCount, setSavedCount] = useState(0);
  const step = path[path.length - 1];
  const today = todayLocalDateString(Intl.DateTimeFormat().resolvedOptions().timeZone);
  const exit = useWizardExit(mealId, savedCount, today);

  return {
    step,
    dispatch,
    // Back pops a captured step while there is one; from the first step it
    // is the way out of the wizard entirely.
    handleBack: () => (path.length > 1 ? dispatch({ type: "BACK" }) : void exit()),
    // AmountStep already dispatches SAVED itself - this only records that
    // the meal is no longer empty, so exit() keeps it.
    markSaved: () => setSavedCount((count) => count + 1),
    finish: () => void exit(),
    savedCount,
  };
};

interface CaptureWizardShellProps {
  step: WizardStep;
  mealId: string;
  dispatch: (action: PathAction) => void;
  handleBack: () => void;
  onSaved: () => void;
  onDone: () => void;
  reduceMotion: boolean | null;
}

// Extracted so CaptureWizard's own body stays under the line budget - the
// wizard chrome and its animated step content, as one unit.
const CaptureWizardShell = ({
  step,
  mealId,
  dispatch,
  handleBack,
  onSaved,
  onDone,
  reduceMotion,
}: CaptureWizardShellProps) => (
  <WizardShell title={STEP_TITLES[step.kind]} progress={STEP_PROGRESS[step.kind]} onBack={handleBack}>
    <AnimatedStep stepKind={step.kind} reduceMotion={reduceMotion}>
      <StepView step={step} mealId={mealId} dispatch={dispatch} onSaved={onSaved} onDone={onDone} />
    </AnimatedStep>
  </WizardShell>
);

export const CaptureWizard = ({ mealId }: { mealId: string }) => {
  const reduceMotion = useReducedMotion();
  const { step, dispatch, handleBack, markSaved, finish, savedCount } = useCaptureWizard(mealId);

  return (
    <>
      <CaptureWizardShell
        step={step}
        mealId={mealId}
        dispatch={dispatch}
        handleBack={handleBack}
        onSaved={markSaved}
        onDone={finish}
        reduceMotion={reduceMotion}
      />
      {savedCount > 0 && <LogSuccessPulse trigger={savedCount} />}
    </>
  );
};
