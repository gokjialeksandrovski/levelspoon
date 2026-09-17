"use client";

import { CheckCircleIcon } from "@phosphor-icons/react";
import { motion, useReducedMotion } from "motion/react";
import { useRouter } from "next/navigation";
import { useEffect, useReducer, useRef, useState } from "react";

import type { CalorieRemaining } from "@/features/goals/actions/goals.utils";
import { discardEmptyMeal, getDayLog } from "@/features/meals/actions/meals";
import { DayCalorieStat } from "@/features/meals/components/day-calorie-stat";
import { Button } from "@/components/ui/button";
import { todayLocalDateString } from "@/lib/date/day-bounds";
import { slideInitial, slideTransition } from "@/lib/motion/step-transition";

import { pathReducer, type PathAction } from "./capture-wizard.path";
import { INITIAL_WIZARD_STEP, type WizardStep } from "./capture-wizard.types";
import { AmountStep } from "./steps/amount-step";
import { ConfirmStep } from "./steps/confirm-step";
import { MatchResultStep } from "./steps/match-result-step";
import { NutritionPhotoStep } from "./steps/nutrition-photo-step";
import { BarcodeNameStep, ManualNameStep, ProductNameStep } from "./steps/product-name-step";
import { ServingSizeStep } from "./steps/serving-size-step";
import { StandardFoodSearchStep } from "./steps/standard-food-search-step";
import { WizardShell } from "./wizard-shell";

// The three product-* steps share a title and progress: alternate ways into
// one stage, not progress through it.
const STEP_TITLES: Record<WizardStep["kind"], string> = {
  "product-photo": "Product name",
  "product-manual": "Product name",
  "product-barcode": "Product name",
  "standard-food-search": "Whole food",
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
  "product-manual": 0.2,
  "product-barcode": 0.2,
  "standard-food-search": 0.3,
  "match-result": 0.4,
  "nutrition-photo": 0.5,
  "serving-size": 0.6,
  confirm: 0.75,
  amount: 0.9,
  saved: 1,
};

interface DaySnapshot {
  consumedKcal: number;
  remaining: CalorieRemaining;
  // The savedCount this fetch answered, so the step can tell a fresh total
  // from the one fetched before the save landed.
  savedCount: number;
}

interface SavedMoment {
  snapshots: DaySnapshot[];
  savedCount: number;
}

// Ingredients count toward the day they are logged on, which is always today.
// Fetched on open and after every save; the last two are kept so the step can
// settle from the old total to the new one.
const useTodaySnapshots = (today: string, savedCount: number): DaySnapshot[] => {
  const [snapshots, setSnapshots] = useState<DaySnapshot[]>([]);

  useEffect(() => {
    getDayLog(today, Intl.DateTimeFormat().resolvedOptions().timeZone)
      .then((log) =>
        setSnapshots((list) => [...list.slice(-1), { consumedKcal: log.dayTotal.energyKcal, remaining: log.calorieRemaining, savedCount }]),
      )
      // Harmless: the step still says "Ingredient saved." without the total.
      .catch((error) => console.error("Loading today's total failed", error));
  }, [today, savedCount]);

  return snapshots;
};

const SAVE_PULSE_SCALE = 1.04;
const SAVE_PULSE_SECONDS = 0.36;

// The log-success pulse, on the number the save changed rather than a
// full-screen flash. Reduced motion skips it; the settle and haptic remain.
const TodayTotal = ({ moment }: { moment: SavedMoment }) => {
  const reduceMotion = useReducedMotion();
  const current = moment.snapshots.at(-1);
  // useTodaySnapshots keeps at most two, so a second one is always the newer.
  const previous = moment.snapshots.length > 1 ? moment.snapshots[0] : undefined;
  if (!current) return null;
  const isSettled = current.savedCount === moment.savedCount;
  const addedKcal = isSettled && previous ? Math.round(current.consumedKcal - previous.consumedKcal) : null;

  return (
    <div>
      <p className="mb-1 text-xs text-text-muted">Today</p>
      <motion.div
        className="origin-left"
        animate={isSettled && !reduceMotion ? { scale: [1, SAVE_PULSE_SCALE, 1] } : undefined}
        transition={{ duration: SAVE_PULSE_SECONDS }}
      >
        <DayCalorieStat consumedKcal={current.consumedKcal} remaining={current.remaining} reduceMotion={reduceMotion} />
      </motion.div>
      <p aria-live="polite" className="mt-2 min-h-5 tabular-nums text-sm text-text-muted">
        {addedKcal !== null && `+${addedKcal.toLocaleString()} kcal from this ingredient`}
      </p>
    </div>
  );
};

interface SavedStepProps {
  moment: SavedMoment;
  dispatch: (action: PathAction) => void;
  onDone: () => void;
}

// Resolves the save on the day's own headline figure, the number the user
// logged this for, instead of a bare "saved" and a trip to another screen.
const SavedStep = ({ moment, dispatch, onDone }: SavedStepProps) => (
  <div className="flex flex-col gap-6 py-6">
    <p className="flex items-center gap-2 text-text">
      <CheckCircleIcon weight="fill" className="text-accent-success" />
      Ingredient saved.
    </p>
    <TodayTotal moment={moment} />
    <div className="flex gap-2">
      <Button variant="primary" className="flex-1" onClick={() => dispatch({ type: "ADD_ANOTHER" })}>
        Add another
      </Button>
      <Button variant="ghost" className="flex-1" onClick={onDone}>
        Done
      </Button>
    </div>
  </div>
);

const renderProductPhotoStep = (
  step: Extract<WizardStep, { kind: "product-photo" }>,
  dispatch: (action: PathAction) => void,
) => <ProductNameStep pendingBarcode={step.pendingBarcode} dispatch={dispatch} />;

const renderManualNameStep = (
  step: Extract<WizardStep, { kind: "product-manual" }>,
  dispatch: (action: PathAction) => void,
) => <ManualNameStep pendingBarcode={step.pendingBarcode} dispatch={dispatch} />;

const renderBarcodeNameStep = (
  step: Extract<WizardStep, { kind: "product-barcode" }>,
  dispatch: (action: PathAction) => void,
) => <BarcodeNameStep pendingBarcode={step.pendingBarcode} dispatch={dispatch} />;

const renderStandardFoodSearchStep = (dispatch: (action: PathAction) => void) => (
  <StandardFoodSearchStep dispatch={dispatch} />
);

const renderMatchResultStep = (
  step: Extract<WizardStep, { kind: "match-result" }>,
  dispatch: (action: PathAction) => void,
) => (
  <MatchResultStep
    nameGuess={step.nameGuess}
    candidates={step.candidates}
    netWeightText={step.netWeightText}
    pendingBarcode={step.pendingBarcode}
    dispatch={dispatch}
  />
);

const renderNutritionPhotoStep = (
  step: Extract<WizardStep, { kind: "nutrition-photo" }>,
  dispatch: (action: PathAction) => void,
) => (
  <NutritionPhotoStep
    nameGuess={step.nameGuess}
    netWeightText={step.netWeightText}
    pendingBarcode={step.pendingBarcode}
    dispatch={dispatch}
  />
);

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
    unitName={step.unitName}
    pendingBarcode={step.pendingBarcode}
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
    nutritionBasisUnit={step.nutritionBasisUnit}
    nutritionBasisQuantity={step.nutritionBasisQuantity}
    pendingBarcode={step.pendingBarcode}
    barcode={step.barcode}
    nutritionOrigin={step.nutritionOrigin}
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
    key={step.product.id}
    mealId={mealId}
    product={step.product}
    alternatives={step.alternatives}
    pendingBarcode={step.pendingBarcode}
    dispatch={dispatch}
    onSaved={onSaved}
  />
);

const renderSavedStep = (moment: SavedMoment, dispatch: (action: PathAction) => void, onDone: () => void) => (
  <SavedStep moment={moment} dispatch={dispatch} onDone={onDone} />
);

interface StepViewProps {
  step: WizardStep;
  mealId: string;
  moment: SavedMoment;
  dispatch: (action: PathAction) => void;
  onSaved: () => void;
  onDone: () => void;
}

// One case per line, like wizardReducer's switch - delegating each case's
// JSX to a named render* function keeps the switch scannable as a state
// map, not a line-count workaround (kept even after the line-count rule
// was dropped).
const StepView = ({ step, mealId, moment, dispatch, onSaved, onDone }: StepViewProps) => {
  switch (step.kind) {
    case "product-photo": return renderProductPhotoStep(step, dispatch);
    case "product-manual": return renderManualNameStep(step, dispatch);
    case "product-barcode": return renderBarcodeNameStep(step, dispatch);
    case "standard-food-search": return renderStandardFoodSearchStep(dispatch);
    case "match-result": return renderMatchResultStep(step, dispatch);
    case "nutrition-photo": return renderNutritionPhotoStep(step, dispatch);
    case "serving-size": return renderServingSizeStep(step, dispatch);
    case "confirm": return renderConfirmStep(step, dispatch);
    case "amount": return renderAmountStep(step, mealId, dispatch, onSaved);
    case "saved": return renderSavedStep(moment, dispatch, onDone);
  }
};

interface AnimatedStepProps {
  stepKind: WizardStep["kind"];
  reduceMotion: boolean | null;
  children: React.ReactNode;
}

// Moves focus to the step container on every step change after the first, so
// a keyboard/screen-reader user isn't dropped back to the document body.
// First run is skipped so arriving at the wizard doesn't yank focus on load.
const useFocusOnStepChange = (stepKind: WizardStep["kind"]) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const isInitialStep = useRef(true);

  useEffect(() => {
    if (isInitialStep.current) {
      isInitialStep.current = false;
      return;
    }
    containerRef.current?.focus();
  }, [stepKind]);

  return containerRef;
};

const AnimatedStep = ({ stepKind, reduceMotion, children }: AnimatedStepProps) => {
  const containerRef = useFocusOnStepChange(stepKind);

  return (
    <motion.div
      key={stepKind}
      ref={containerRef}
      tabIndex={-1}
      className="focus:outline-none"
      initial={slideInitial(reduceMotion)}
      animate={{ opacity: 1, x: 0 }}
      transition={slideTransition(reduceMotion)}
    >
      {children}
    </motion.div>
  );
};

// A meal created by the action bar but never filled in is deleted on the way
// out so it never shows up as an empty row on the day view.
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
  backExits: boolean;
  markSaved: () => void;
  finish: () => void;
  moment: SavedMoment;
}

// Bundles path/save-count state and exit strategy so CaptureWizard's body
// stays under the line budget.
const useCaptureWizard = (mealId: string): UseCaptureWizardResult => {
  const [path, dispatch] = useReducer(pathReducer, [INITIAL_WIZARD_STEP]);
  const [savedCount, setSavedCount] = useState(0);
  const step = path[path.length - 1];
  const today = todayLocalDateString(Intl.DateTimeFormat().resolvedOptions().timeZone);
  const exit = useWizardExit(mealId, savedCount, today);
  const snapshots = useTodaySnapshots(today, savedCount);

  return {
    step,
    dispatch,
    // Back pops a captured step while there is one; from the first step it
    // is the way out of the wizard entirely.
    handleBack: () => (path.length > 1 ? dispatch({ type: "BACK" }) : void exit()),
    backExits: path.length === 1,
    // AmountStep already dispatches SAVED itself - this only records that
    // the meal is no longer empty, so exit() keeps it.
    markSaved: () => setSavedCount((count) => count + 1),
    finish: () => void exit(),
    moment: { snapshots, savedCount },
  };
};

export const CaptureWizard = ({ mealId }: { mealId: string }) => {
  const reduceMotion = useReducedMotion();
  const { step, dispatch, handleBack, backExits, markSaved, finish, moment } = useCaptureWizard(mealId);

  return (
    <WizardShell title={STEP_TITLES[step.kind]} progress={STEP_PROGRESS[step.kind]} onBack={handleBack} exits={backExits}>
      <AnimatedStep stepKind={step.kind} reduceMotion={reduceMotion}>
        <StepView step={step} mealId={mealId} moment={moment} dispatch={dispatch} onSaved={markSaved} onDone={finish} />
      </AnimatedStep>
    </WizardShell>
  );
};
