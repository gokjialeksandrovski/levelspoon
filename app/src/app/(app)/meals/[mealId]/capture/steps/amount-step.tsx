"use client";

import { useState } from "react";

import { useIsGuest } from "@/features/demo/hooks/use-is-guest";
import { linkBarcode } from "@/features/products/actions/barcode";
import { saveMealIngredient } from "@/features/meals/actions/meals";
import { previewContribution, type ContributionPreview } from "@/features/meals/actions/meals.utils";
import type { ProductCandidate } from "@/features/products/actions/products";
import { getPortions } from "@/features/products/actions/portions";
import { estimateQuantity } from "@/features/quantity/actions/quantity";
import { Button } from "@/components/ui/button";
import { InlineMessage } from "@/components/ui/inline-message";
import { EMPTY_AMOUNT_MESSAGE, UnitAmountField } from "@/components/ui/unit-amount-field";
import { triggerLogSuccessHaptic } from "@/lib/haptics/log-success";
import { availableUnits, defaultUnit } from "@/lib/measures/available-units";
import type { MeasureContext } from "@/lib/measures/resolve-grams";
import { resolveQuantity } from "@/lib/measures/resolve-quantity";

import { AmountChips, useRecentAmounts } from "../../amount-chips";
import { PortionEditor } from "../../portion-editor";
import {
  mergeChips,
  unitsForSelect,
  type AmountChip,
} from "../../amount-chips.utils";
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
   * spec §7). */
  pendingBarcode: string | null;
  dispatch: (action: WizardAction) => void;
  onSaved: () => void;
}

interface AmountStepHeaderProps {
  productName: string;
  hasAlternatives: boolean;
  onChangeMatch: () => void;
}

const AmountStepHeader = ({
  productName,
  hasAlternatives,
  onChangeMatch,
}: AmountStepHeaderProps) => (
  <div className="flex items-center justify-between gap-4">
    <h2 className="min-w-0 wrap-break-word text-lg font-semibold">Using {productName}</h2>
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

// Standalone with a bundled callbacks object, mirroring ingredient-row.tsx's
// shape. Separate from setIsBusy, which also covers the save: otherwise saving would
// light the photo overlay with nothing being read.
const estimateAmount = async (
  photo: File,
  onEstimated: (value: string) => void,
  callbacks: AmountStepCallbacks,
  setIsEstimating: (value: boolean) => void,
): Promise<void> => {
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
  entryCount: number;
  entryUnit: string;
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
    entryCount: input.entryCount,
    entryUnit: input.entryUnit,
    quantitySource: input.source,
  });
  triggerLogSuccessHaptic();
  dispatch({ type: "SAVED" });
  onSaved();
};

// Exported so amount-step.test.ts can call it directly.
export const saveAmount = async (
  input: SaveAmountInput,
  dispatch: (action: WizardAction) => void,
  onSaved: () => void,
  callbacks: AmountStepCallbacks,
): Promise<void> => {
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
  if (input.count.trim() === "") {
    callbacks.setError(EMPTY_AMOUNT_MESSAGE);
    return;
  }
  const resolution = resolveQuantity(input.count, input.unit, input.context);
  if (resolution.kind === "unresolved") {
    callbacks.setError(
      `Could not work out the amount in “${input.unit}” - try a different unit.`,
    );
    return;
  }
  await saveAmount(
    // The echo is what the user typed, never the resolution: a "1 slice" entry
    // that resolves to 28 g has to keep saying "1 slice".
    {
      mealId: input.mealId,
      productId: input.productId,
      quantity: resolution.quantity,
      quantityUnit: resolution.quantityUnit,
      entryCount: Number(input.count),
      entryUnit: input.unit,
      source: input.source,
    },
    dispatch,
    onSaved,
    callbacks,
  );
};

const RECENTS_HINT =
  "Your last five entered amounts for this product appear above.";

// Nothing is above the field until this product has history: the recents
// cluster renders null when empty, and a product with no portions has no chip
// row at all. Pointing at that space would be pointing at nothing.
const NO_RECENTS_HINT = "Amounts you enter are saved for next time.";

const contextFor = (product: SelectedProduct): MeasureContext => ({
  productName: product.name,
  densityGMl: product.densityGMl,
  servingUnit: product.servingUnit,
  servingGrams: product.servingGrams,
  nutritionBasisUnit: product.nutritionBasisUnit,
  portions: product.portions,
});

interface UseAmountStepFormResult {
  count: string;
  unit: string;
  units: string[];
  chips: AmountChip[];
  hasRecents: boolean;
  isLoadingChips: boolean;
  preview: ContributionPreview;
  error: string | null;
  isBusy: boolean;
  isEstimating: boolean;
  setCount: (value: string) => void;
  setUnit: (value: string) => void;
  pickChip: (count: string, unit: string) => void;
  refreshProduct: () => Promise<void>;
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

const buildAmountStepActions = (
  deps: AmountStepActionDeps,
  state: AmountStepFormState,
) => {
  const setCountManually = (value: string) => {
    state.setCount(value);
    state.setSource("manual");
  };
  const setUnitManually = (value: string) => {
    state.setUnit(value);
    state.setSource("manual");
  };
  const setCountFromPhoto = (value: string) => {
    state.setCount(value);
    state.setUnit("g");
    state.setSource("ai_estimated");
  };

  const pickChip = (value: string, chipUnit: string) => {
    state.setCount(value);
    state.setUnit(chipUnit);
    state.setSource("manual");
  };

  return {
    setCount: setCountManually,
    setUnit: setUnitManually,
    pickChip,
    refreshProduct: async () =>
      deps.dispatch({
        type: "PORTIONS_UPDATED",
        portions: await getPortions(deps.product.id),
      }),
    handlePhoto: (photo: File) =>
      estimateAmount(
        photo,
        setCountFromPhoto,
        deps.callbacks,
        deps.setIsEstimating,
      ),
    handleSave: () =>
      resolveAndSaveAmount(
        {
          mealId: deps.mealId,
          productId: deps.product.id,
          count: state.count,
          unit: state.unit,
          context: deps.context,
          source: state.source,
        },
        deps.dispatch,
        deps.onSaved,
        deps.callbacks,
      ),
    changeMatch: () =>
      deps.dispatch({
        type: "CHANGE_MATCH",
        nameGuess: deps.product.name,
        candidates: [deps.product, ...deps.alternatives],
        pendingBarcode: deps.pendingBarcode,
      }),
  };
};

const useAmountStepForm = (
  mealId: string,
  product: SelectedProduct,
  alternatives: SelectedProduct[],
  pendingBarcode: string | null,
  dispatch: (action: WizardAction) => void,
  onSaved: () => void,
): UseAmountStepFormResult => {
  const context = contextFor(product);
  const units = availableUnits(context);
  const { recents, isLoading: isLoadingChips } = useRecentAmounts(product.id);
  const chips = mergeChips(recents, product.portions);
  const [count, setCount] = useState("");
  const [unit, setUnit] = useState(defaultUnit(context));
  const [source, setSource] = useState<"ai_estimated" | "manual">("manual");
  const [error, setError] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const [isEstimating, setIsEstimating] = useState(false);

  const actions = buildAmountStepActions(
    {
      mealId,
      product,
      alternatives,
      context,
      pendingBarcode,
      dispatch,
      onSaved,
      callbacks: { setError, setIsBusy },
      setIsEstimating,
    },
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

  return {
    count,
    unit,
    units,
    chips,
    hasRecents: recents.length > 0,
    isLoadingChips,
    preview,
    error,
    isBusy,
    isEstimating,
    ...actions,
  };
};

interface AmountStepBodyProps {
  form: UseAmountStepFormResult;
  product: SelectedProduct;
}

// Three groups down this screen, tight inside and generous between, so
// proximity says what belongs with what: a flat gap-4 left every control
// equidistant from the one it belongs with and the one it does not.
// Everything that sets the amount goes together: the chips, the editor that
// changes what a chip weighs, and the field that overrides both. Then the
// outcome and the commit, one group apart - the gap is the grouping.
//
// Four distances, and every gap on this screen is one of them:
//   6px  gap-1.5  a label to the control it names (Field, UnitAmountField,
//                 PhotoInput's hint, a chip cluster's heading)
//   12px gap-3    sibling clusters inside one block (recents, standards)
//   16px gap-4    distinct controls inside one group
//   24px gap-6    group to group
// The step from 6 to 16 is what makes a label unambiguous: "Amount" was 8px
// below the chip row and 8px above its own input, so proximity named nothing.
const AmountStepFields = ({ form, product }: AmountStepBodyProps) => (
  <>
    <div className="flex flex-col gap-4">
      {/* The editor docks into the "Standard sizes" header rather than floating
          under the row: a centred underlined link in a left-aligned column read
          as a page footer action, and nothing on screen was called a portion
          size. Gated here on the portions themselves - an editor that renders
          null is still a header action, and would hold an empty label open. */}
      <AmountChips
        chips={form.chips}
        count={form.count}
        unit={form.unit}
        isLoading={form.isLoadingChips}
        standardAction={
          product.portions.length > 0 ? (
            <PortionEditor
              productId={product.id}
              portions={product.portions}
              onSaved={form.refreshProduct}
            />
          ) : null
        }
        onPick={form.pickChip}
      />
      {/* Always open, exactly as the cooking-fat sheet renders it. Typing a
          gram figure is a first-class path, not the fallback a collapsed
          "Enter an exact amount" toggle made it look like. */}
      <UnitAmountField
        name="grams"
        count={form.count}
        unit={form.unit}
        units={unitsForSelect(form.units, form.chips, form.unit)}
        helperText={form.hasRecents ? RECENTS_HINT : NO_RECENTS_HINT}
        onCountChange={form.setCount}
        onUnitChange={form.setUnit}
      />
    </div>
    <div className="flex flex-col gap-4">
      <AmountPreview preview={form.preview} />
      {form.error && <InlineMessage tone="error">{form.error}</InlineMessage>}
      {/* Spinning Save during an estimate would claim a save is in flight. */}
      <Button
        disabled={form.isEstimating}
        pending={form.isBusy && !form.isEstimating}
        onClick={form.handleSave}
      >
        Save ingredient
      </Button>
    </div>
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

const BarcodeLinkOfferPrompt = ({
  productName,
  isLinking,
  onAccept,
  onDecline,
}: BarcodeLinkOfferPromptProps) => (
  <div className="flex flex-col gap-2">
    <p className="text-sm text-text">Link barcode to {productName}?</p>
    <div className="flex gap-2">
      <Button variant="ghost" pending={isLinking} onClick={onAccept}>
        Yes, link it
      </Button>
      <Button variant="ghost" disabled={isLinking} onClick={onDecline}>
        No thanks
      </Button>
    </div>
  </div>
);

interface BarcodeLinkConflictProps {
  product: ProductCandidate;
  dispatch: (action: WizardAction) => void;
}

const BarcodeLinkConflict = ({
  product,
  dispatch,
}: BarcodeLinkConflictProps) => (
  <div className="flex flex-col gap-2">
    <InlineMessage tone="warning">
      This barcode is already linked to {product.name}.
    </InlineMessage>
    <Button
      variant="ghost"
      onClick={() =>
        dispatch({
          type: "CANDIDATE_CHOSEN",
          product: toSelectedProduct(product),
          alternatives: [],
          pendingBarcode: null,
        })
      }
    >
      Use {product.name} instead
    </Button>
  </div>
);

const BarcodeLinkOffer = ({
  pendingBarcode,
  productId,
  productName,
  dispatch,
}: BarcodeLinkOfferProps) => {
  const { state, accept, decline } = useBarcodeLinkOffer(
    pendingBarcode,
    productId,
  );

  if (state.kind === "resolved") {
    return null;
  }
  if (state.kind === "conflict") {
    return <BarcodeLinkConflict product={state.product} dispatch={dispatch} />;
  }
  return (
    <>
      <BarcodeLinkOfferPrompt
        productName={productName}
        isLinking={state.kind === "linking"}
        onAccept={accept}
        onDecline={decline}
      />
      {state.kind === "error" && (
        <InlineMessage tone="error">{LINK_BARCODE_ERROR}</InlineMessage>
      )}
    </>
  );
};

export const AmountStep = ({
  mealId,
  product,
  alternatives,
  pendingBarcode,
  dispatch,
  onSaved,
}: AmountStepProps) => {
  const isGuest = useIsGuest();
  const form = useAmountStepForm(
    mealId,
    product,
    alternatives,
    pendingBarcode,
    dispatch,
    onSaved,
  );

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-4">
        <AmountStepHeader
          productName={product.name}
          hasAlternatives={alternatives.length > 0}
          onChangeMatch={form.changeMatch}
        />
        {pendingBarcode && !isGuest && (
          <BarcodeLinkOffer
            pendingBarcode={pendingBarcode}
            productId={product.id}
            productName={product.name}
            dispatch={dispatch}
          />
        )}
        {form.units.includes("g") && !isGuest && (
          <AmountPhotoField
            onSelect={form.handlePhoto}
            isEstimating={form.isEstimating}
          />
        )}
      </div>
      <AmountStepFields form={form} product={product} />
    </div>
  );
};
