"use client";

import { useReducedMotion } from "motion/react";

import type { ContributionPreview } from "@/features/meals/actions/meals.utils";
import { MacroLine } from "@/features/meals/components/macro-line";
import type { NutritionValues } from "@/types/nutrition";
import { SettleNumber } from "@/components/ui/settle-number";

// Two ways of answering "what is this worth": what a typed amount would add,
// and what a product is per its own basis. Both sit on MacroLine so the accent
// roles and the P/C/F redundant cue stay identical wherever figures appear.

// Says what the slot is for while it has no figure to show. The height was
// always reserved so a Save button below never jumps the moment a typed count
// becomes resolvable, but reserving it empty read as a hole in the column - and
// this is the one place that can say where a kcal figure comes from. True of
// both unavailable cases: nothing entered yet, and an amount that did not
// resolve (see previewContribution).
const PREVIEW_PLACEHOLDER = "Pick or type an amount to see what it adds.";

// justify-center only moves the placeholder: the ready state's kcal line plus
// MacroLine already fill the reserved height.
export const AmountPreview = ({ preview }: { preview: ContributionPreview }) => {
  const reduceMotion = useReducedMotion();

  return (
    <div className="flex min-h-12 flex-col justify-center" aria-live="polite">
      {preview.kind === "ready" ? (
        <>
          <p className="tabular-nums text-base font-medium text-text">
            <SettleNumber value={Math.round(preview.contribution.energyKcal)} reduceMotion={reduceMotion} /> kcal
          </p>
          <MacroLine contribution={preview.contribution} size="sm" animate />
        </>
      ) : (
        <p className="text-sm text-text-muted">{PREVIEW_PLACEHOLDER}</p>
      )}
    </div>
  );
};

interface ProductSummaryProps {
  name: string;
  /** Null for a whole food - a banana is nobody's product. */
  brand: string | null;
  nutritionPerBasis: NutritionValues;
  basisQuantity: number;
  basisUnit: string;
}

// Wording matches the confirm step's own "(per 100 g)" heading rather than a
// "/100g" shorthand, so the same idea reads the same way on both screens.
const basisLabel = (quantity: number, unit: string): string => `per ${quantity} ${unit}`;

// What a candidate row needs to be pickable. Trigram similarity cannot separate
// "2% Fat" from "10% Fat", so the name alone is not a choice - the figures are.
export const ProductSummary = ({ name, brand, nutritionPerBasis, basisQuantity, basisUnit }: ProductSummaryProps) => (
  <span className="flex flex-col gap-0.5">
    <span className="font-medium text-text">{name}</span>
    <span className="text-xs tabular-nums text-text-muted">
      {brand === null ? "" : `${brand} · `}
      {Math.round(nutritionPerBasis.energyKcal)} kcal {basisLabel(basisQuantity, basisUnit)}
    </span>
    <MacroLine contribution={nutritionPerBasis} />
  </span>
);
