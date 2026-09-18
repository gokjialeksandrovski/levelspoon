"use client";

import { useState } from "react";

import { linkBarcode } from "@/features/products/actions/barcode";
import { saveMealIngredient } from "@/features/meals/actions/meals";
import { previewContribution, type ContributionPreview } from "@/features/meals/actions/meals.utils";
import type { ProductCandidate } from "@/features/products/actions/products";
import { estimateQuantity } from "@/features/quantity/actions/quantity";
import { Button } from "@/components/ui/button";
import { InlineMessage } from "@/components/ui/inline-message";
import { UnitAmountField } from "@/components/ui/unit-amount-field";
import { triggerLogSuccessHaptic } from "@/lib/haptics/log-success";
import { availableUnits, defaultUnit } from "@/lib/measures/available-units";
import type { MeasureContext } from "@/lib/measures/resolve-grams";
import { resolveQuantity } from "@/lib/measures/resolve-quantity";

import { AmountPreview } from "../../nutrition-summary";
import { toSelectedProduct } from "../capture-wizard.types";
import type { SelectedProduct, WizardAction } from "../capture-wizard.types";

import { AmountPhotoField } from "./amount-photo-field";

interface AmountStepProps {
  mealId: string;
  product: SelectedProduct;
  alternatives: SelectedProduct[];
  /** Non-null only when arriving via a confident/chosen match after an
   * earlier not_found scan - renders the link-this-barcode offer (barcode
   * spec §7, T4, Task 3). */
  pendingBarcode: string | null;
  dispatch: (action: WizardAction) => void;
  onSaved: () => void;
}

interface AmountStepHeaderProps {
  productName: string;
  hasAlternatives: boolean;
  onChangeMatch: () => void;
}

const AmountStepHeader = ({ productName, hasAlternatives, onChangeMatch }: AmountStepHeaderProps) => (
  <div className="flex items-center justify-between">
    <h2 className="text-lg font-semibold">Using {productName}</h2>
    {hasAlternatives && (
      <Button variant="ghost" link onClick={onChangeMatch}>
        Pick another
      </Button>
    )}
  </div>
);

interface AmountStepCallbacks {
  setError: (error: string | null) => void;
  setIsBusy: (isBusy: boolean) => void;
}

// Standalone, not a hook, so useAmountStepForm's body stays under the line
// budget - bundled callbacks object, mirroring ingredient-row.tsx's shape.
// Separate from setIsBusy, which also covers the save: otherwise saving would
// light the photo overlay with nothing being read.
const estimateAmount = async (photo: File, onEstimated: (value: string) => void, callbacks: AmountStepCallbacks, setIsEstimating: (value: boolean) => void): Promise<void> => {
  setIsEstimating(true);
  callbacks.setIsBusy(true);
  callbacks.setError(null);
  try {
    const { grams: estimated } = await estimateQuantity(photo);
    onEstimated(String(estimated));
  } catch (error) {
    console.error("Quantity estimation failed", error);
    callbacks.setError("Could not estimate the amount - enter it manually.");
  } finally {
    callbacks.setIsBusy(false);
    setIsEstimating(false);
  }
};

interface SaveAmountInput {
  mealId: string;
  productId: string;
  quantity: number;
  quantityUnit: string;
  source: "ai_estimated" | "manual";
}

const commitAmountSave = async (
  input: SaveAmountInput,
  dispatch: (action: WizardAction) => void,
  onSaved: () => void,
): Promise<void> => {
  await saveMealIngredient({
    mealId: input.mealId,
    productId: input.productId,
    quantity: input.quantity,
    quantityUnit: input.quantityUnit,
    quantitySource: input.source,
  });
  triggerLogSuccessHaptic();
  dispatch({ type: "SAVED" });
  onSaved();
};

// Exported so amount-step.test.ts can call it directly.
export const saveAmount = async (input: SaveAmountInput, dispatch: (action: WizardAction) => void, onSaved: () => void, callbacks: AmountStepCallbacks): Promise<void> => {
  callbacks.setError(null);
  callbacks.setIsBusy(true);
  try {
    await commitAmountSave(input, dispatch, onSaved);
  } catch (error) {
    console.error("Saving the meal ingredient failed", error);
    callbacks.setError("Could not save this ingredient. Please try again.");
  } finally {
    callbacks.setIsBusy(false);
  }
};

interface ResolveAndSaveInput {
  mealId: string;
  productId: string;
  count: string;
  unit: string;
  context: MeasureContext;
  source: "ai_estimated" | "manual";
}

// Splits "turn typed count+unit into a savable quantity" out of saveAmount
// (which only deals in an already-resolved quantity+unit) as its own
// testable, DI'd unit of work.
export const resolveAndSaveAmount = async (
  input: ResolveAndSaveInput,
  dispatch: (action: WizardAction) => void,
  onSaved: () => void,
  callbacks: AmountStepCallbacks,
): Promise<void> => {
  const resolution = resolveQuantity(input.count, input.unit, input.context);
  if (resolution.kind === "unresolved") {
    callbacks.setError(`Could not work out the amount in "${input.unit}" - try a different unit.`);
    return;
  }
  await saveAmount(
    { mealId: input.mealId, productId: input.productId, quantity: resolution.quantity, quantityUnit: resolution.quantityUnit, source: input.source },
    dispatch,
    onSaved,
    callbacks,
  );
};

const contextFor = (product: SelectedProduct): MeasureContext => ({
  productName: product.name,
  densityGMl: product.densityGMl,
  servingUnit: product.servingUnit,
  servingGrams: product.servingGrams,
  nutritionBasisUnit: product.nutritionBasisUnit,
  // Filled by playbook 02, which resolves a product's portion class server-side.
  portions: [],
});

interface UseAmountStepFormResult {
  count: string;
  unit: string;
  units: string[];
  preview: ContributionPreview;
  error: string | null;
  isBusy: boolean;
  isEstimating: boolean;
  setCount: (value: string) => void;
  setUnit: (value: string) => void;
  handlePhoto: (photo: File) => Promise<void>;
  handleSave: () => Promise<void>;
  changeMatch: () => void;
}

interface AmountStepActionDeps {
  mealId: string;
  product: SelectedProduct;
  alternatives: SelectedProduct[];
  context: MeasureContext;
  pendingBarcode: string | null;
  dispatch: (action: WizardAction) => void;
  onSaved: () => void;
  callbacks: AmountStepCallbacks;
  setIsEstimating: (value: boolean) => void;
}

interface AmountStepFormState {
  count: string;
  unit: string;
  source: "ai_estimated" | "manual";
  setCount: (value: string) => void;
  setUnit: (value: string) => void;
  setSource: (value: "ai_estimated" | "manual") => void;
}

const buildAmountStepActions = (deps: AmountStepActionDeps, state: AmountStepFormState) => {
  const setCountManually = (value: string) => { state.setCount(value); state.setSource("manual"); };
  const setUnitManually = (value: string) => { state.setUnit(value); state.setSource("manual"); };
  const setCountFromPhoto = (value: string) => { state.setCount(value); state.setUnit("g"); state.setSource("ai_estimated"); };

  return {
    setCount: setCountManually,
    setUnit: setUnitManually,
    handlePhoto: (photo: File) => estimateAmount(photo, setCountFromPhoto, deps.callbacks, deps.setIsEstimating),
    handleSave: () =>
      resolveAndSaveAmount({ mealId: deps.mealId, productId: deps.product.id, count: state.count, unit: state.unit, context: deps.context, source: state.source }, deps.dispatch, deps.onSaved, deps.callbacks),
    changeMatch: () =>
      deps.dispatch({ type: "CHANGE_MATCH", nameGuess: deps.product.name, candidates: [deps.product, ...deps.alternatives], pendingBarcode: deps.pendingBarcode }),
  };
};

const useAmountStepForm = (mealId: string, product: SelectedProduct, alternatives: SelectedProduct[], pendingBarcode: string | null, dispatch: (action: WizardAction) => void, onSaved: () => void): UseAmountStepFormResult => {
  const context = contextFor(product);
  const units = availableUnits(context);
  const [count, setCount] = useState("");
  const [unit, setUnit] = useState(defaultUnit(context));
  const [source, setSource] = useState<"ai_estimated" | "manual">("manual");
  const [error, setError] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const [isEstimating, setIsEstimating] = useState(false);

  const actions = buildAmountStepActions(
    { mealId, product, alternatives, context, pendingBarcode, dispatch, onSaved, callbacks: { setError, setIsBusy }, setIsEstimating },
    { count, unit, source, setCount, setUnit, setSource },
  );

  // Derived, not state: the same resolve-then-scale the save path runs, so the
  // figure on screen and the row that gets written can never disagree.
  const preview = previewContribution({
    count,
    unit,
    context,
    nutritionPerBasis: product.nutritionPerBasis,
    basisQuantity: product.nutritionBasisQuantity,
  });

  return { count, unit, units, preview, error, isBusy, isEstimating, ...actions };
};

interface AmountStepFieldsProps {
  form: UseAmountStepFormResult;
}

const AmountStepFields = ({ form }: AmountStepFieldsProps) => (
  <>
    {form.units.includes("g") && <AmountPhotoField onSelect={form.handlePhoto} isEstimating={form.isEstimating} />}
    <UnitAmountField
      name="grams"
      count={form.count}
      unit={form.unit}
      units={form.units}
      onCountChange={form.setCount}
      onUnitChange={form.setUnit}
    />
    <AmountPreview preview={form.preview} />
    {form.error && <InlineMessage tone="error">{form.error}</InlineMessage>}
    {/* Spinning Save during an estimate would claim a save is in flight. */}
    <Button disabled={form.count.trim() === "" || form.isEstimating} pending={form.isBusy && !form.isEstimating} onClick={form.handleSave}>
      Save ingredient
    </Button>
  </>
);

interface AcceptBarcodeLinkOfferCallbacks {
  onLinked: () => void;
  onConflict: (product: ProductCandidate) => void;
  onError: (message: string) => void;
}

const LINK_BARCODE_ERROR = "Could not link this barcode. Please try again.";

// Exported so amount-step.test.ts can call it directly, mirroring
// saveAmount's own standalone-async-function pattern above.
export const acceptBarcodeLinkOffer = async (
  barcode: string,
  productId: string,
  callbacks: AcceptBarcodeLinkOfferCallbacks,
): Promise<void> => {
  try {
    const result = await linkBarcode(barcode, productId);
    if (result.kind === "linked") {
      callbacks.onLinked();
      return;
    }
    callbacks.onConflict(result.product);
  } catch {
    callbacks.onError(LINK_BARCODE_ERROR);
  }
};

type LinkOfferState =
  | { kind: "idle" }
  | { kind: "linking" }
  | { kind: "resolved" }
  | { kind: "conflict"; product: ProductCandidate }
  | { kind: "error" };

interface BarcodeLinkOfferProps {
  pendingBarcode: string;
  productId: string;
  productName: string;
  dispatch: (action: WizardAction) => void;
}

const useBarcodeLinkOffer = (pendingBarcode: string, productId: string) => {
  const [state, setState] = useState<LinkOfferState>({ kind: "idle" });
  const accept = () => {
    setState({ kind: "linking" });
    void acceptBarcodeLinkOffer(pendingBarcode, productId, {
      onLinked: () => setState({ kind: "resolved" }),
      onConflict: (product) => setState({ kind: "conflict", product }),
      onError: () => setState({ kind: "error" }),
    });
  };
  return { state, accept, decline: () => setState({ kind: "resolved" }) };
};

interface BarcodeLinkOfferPromptProps {
  productName: string;
  isLinking: boolean;
  onAccept: () => void;
  onDecline: () => void;
}

const BarcodeLinkOfferPrompt = ({ productName, isLinking, onAccept, onDecline }: BarcodeLinkOfferPromptProps) => (
  <div className="flex flex-col gap-2">
    <p className="text-sm text-text">Link barcode to {productName}?</p>
    <div className="flex gap-2">
      <Button variant="ghost" pending={isLinking} onClick={onAccept}>Yes, link it</Button>
      <Button variant="ghost" disabled={isLinking} onClick={onDecline}>No thanks</Button>
    </div>
  </div>
);

interface BarcodeLinkConflictProps {
  product: ProductCandidate;
  dispatch: (action: WizardAction) => void;
}

const BarcodeLinkConflict = ({ product, dispatch }: BarcodeLinkConflictProps) => (
  <div className="flex flex-col gap-2">
    <InlineMessage tone="warning">This barcode is already linked to {product.name}.</InlineMessage>
    <Button
      variant="ghost"
      onClick={() => dispatch({ type: "CANDIDATE_CHOSEN", product: toSelectedProduct(product), alternatives: [], pendingBarcode: null })}
    >
      Use {product.name} instead
    </Button>
  </div>
);

const BarcodeLinkOffer = ({ pendingBarcode, productId, productName, dispatch }: BarcodeLinkOfferProps) => {
  const { state, accept, decline } = useBarcodeLinkOffer(pendingBarcode, productId);

  if (state.kind === "resolved") {
    return null;
  }
  if (state.kind === "conflict") {
    return <BarcodeLinkConflict product={state.product} dispatch={dispatch} />;
  }
  return (
    <>
      <BarcodeLinkOfferPrompt productName={productName} isLinking={state.kind === "linking"} onAccept={accept} onDecline={decline} />
      {state.kind === "error" && <InlineMessage tone="error">{LINK_BARCODE_ERROR}</InlineMessage>}
    </>
  );
};

export const AmountStep = ({ mealId, product, alternatives, pendingBarcode, dispatch, onSaved }: AmountStepProps) => {
  const form = useAmountStepForm(mealId, product, alternatives, pendingBarcode, dispatch, onSaved);

  return (
    <div className="flex flex-col gap-4">
      <AmountStepHeader
        productName={product.name}
        hasAlternatives={alternatives.length > 0}
        onChangeMatch={form.changeMatch}
      />
      {pendingBarcode && (
        <BarcodeLinkOffer pendingBarcode={pendingBarcode} productId={product.id} productName={product.name} dispatch={dispatch} />
      )}
      <AmountStepFields form={form} />
    </div>
  );
};
