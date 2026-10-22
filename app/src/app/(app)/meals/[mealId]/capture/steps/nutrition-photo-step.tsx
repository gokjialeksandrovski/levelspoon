"use client";

import { PencilSimpleIcon } from "@phosphor-icons/react";
import { useState } from "react";

import { DEMO_SCAN_LIMIT_MESSAGE } from "@/features/demo/demo.messages";
import { ocrNutritionTable } from "@/features/products/actions/ocr";
import { InlineMessage } from "@/components/ui/inline-message";
import { PhotoInput } from "@/components/ui/photo-input";
import { NOTHING_LEARNED } from "@/lib/measures/learn";

import type { WizardAction } from "../capture-wizard.types";
import { EntryOptionRow } from "./product-name-step";

interface NutritionPhotoStepProps {
  nameGuess: string;
  netWeightText: string | null;
  pendingBarcode: string | null;
  dispatch: (action: WizardAction) => void;
}

// No fibre_g: a flag says "this field needs your attention before Save", and a
// blank fibre is a legitimate answer rather than something to fix.
const ALL_NUTRITION_FLAGS = [
  "energy_kcal",
  "fat_g",
  "saturates_g",
  "carbohydrate_g",
  "sugars_g",
  "protein_g",
  "salt_g",
];

const ALL_NULL_NUTRITION = {
  energyKcal: null,
  fatG: null,
  saturatesG: null,
  carbohydrateG: null,
  sugarsG: null,
  proteinG: null,
  saltG: null,
  fibreG: null,
};

const MANUAL_ENTRY_BASIS_UNIT = "g";
const MANUAL_ENTRY_BASIS_QUANTITY = 100;

// Exported so correction-form.tsx's claim-photo refusal (a second write path
// that mints the same kind of key) shows the same words rather than a second,
// independently-worded string for the identical case.
export const photoReuseError = (ownerName: string | null): string =>
  ownerName === null
    ? "This label photo already belongs to another product. Take a photo of this product's own label."
    : `This label photo already belongs to ${ownerName}. Take a photo of this product's own label.`;

interface UseNutritionPhotoStepResult {
  error: string | null;
  isLoading: boolean;
  photo: File | null;
  handleSelect: (selected: File) => Promise<void>;
  handleManualEntry: () => void;
}

const useNutritionPhotoStep = (nameGuess: string, netWeightText: string | null, pendingBarcode: string | null, dispatch: (action: WizardAction) => void): UseNutritionPhotoStepResult => {
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [photo, setPhoto] = useState<File | null>(null);

  const handleSelect = async (selected: File): Promise<void> => {
    setPhoto(selected);
    setError(null);
    setIsLoading(true);
    try {
      const read = await ocrNutritionTable(selected, nameGuess, netWeightText);
      if (read.kind === "photo-already-used") {
        // Cleared from state as well as rejected: handleManualEntry carries
        // `photo` forward, which would smuggle the borrowed photo to confirm.
        setPhoto(null);
        setError(photoReuseError(read.ownerName));
        return;
      }
      if (read.kind === "demo-limit") {
        setPhoto(null);
        setError(DEMO_SCAN_LIMIT_MESSAGE);
        return;
      }
      if (read.kind === "needs-serving-size") {
        dispatch({ type: "SERVING_SIZE_NEEDED", servingSizeText: read.servingSizeText, perServing: read.perServing, name: nameGuess, photo: selected, prefillGrams: read.prefillGrams, unitName: read.unitName, pendingBarcode });
        return;
      }
      dispatch({ type: "NUTRITION_PARSED", parsed: read.values, flags: read.flags, name: nameGuess, photo: selected, learned: read.learned, nutritionBasisUnit: read.nutritionBasisUnit, nutritionBasisQuantity: read.nutritionBasisQuantity, pendingBarcode });
    } catch {
      setError("Couldn't read the nutrition table in this photo. Retake it with the whole table in frame, headings included.");
    } finally {
      setIsLoading(false);
    }
  };
  // No photo is a valid answer, not a failure: the product is saved and
  // logged like any other, it is just private to this user (spec §S2).
  const handleManualEntry = () => {
    dispatch({ type: "NUTRITION_PARSED", parsed: ALL_NULL_NUTRITION, flags: ALL_NUTRITION_FLAGS, name: nameGuess, photo: photo ?? undefined, learned: NOTHING_LEARNED, nutritionBasisUnit: MANUAL_ENTRY_BASIS_UNIT, nutritionBasisQuantity: MANUAL_ENTRY_BASIS_QUANTITY, pendingBarcode });
  };

  return { error, isLoading, photo, handleSelect, handleManualEntry };
};

const READING_LABEL = "Reading the nutrition table…";

// Figures are read against their column heading (per 100g, per 100ml or per
// serving), so a photo cropped below the headings fails however sharp the
// figures are.
const FRAMING_HINT = "Fit the whole table in the photo, headings included.";

// Its own note rather than a clause on the framing hint: it answers a
// different question ("does my label work?"), and stops a user reading
// "per 100g" as the only label that does. With no printed weight, the
// serving-size step asks for it.
const PER_SERVING_NOTE =
  'Per-serving tables work too. If the serving shows its weight, like "1 bar (40g)", we convert it to per 100g. If not, we ask you for it.';

// Said where the choice is made, not after the save. Shown only when it is
// true: visibleToUser (products.ts) shares a row that has either a label
// photo or a barcode, so a pending barcode or a photo already in hand would
// make this a false promise - confirm-step states the outcome for those.
const PRIVATE_PRODUCT_HINT = "Saved for you only. A product is shared once it has a label photo or a barcode.";
const MANUAL_ENTRY_DESCRIPTION = "Type the figures from the label yourself.";

const manualEntryDescription = (hasPhoto: boolean, pendingBarcode: string | null): string =>
  hasPhoto || pendingBarcode !== null ? MANUAL_ENTRY_DESCRIPTION : PRIVATE_PRODUCT_HINT;

// A hairline either side of "or": the manual row is the other way through
// this step, not a footnote to the photo.
const OrDivider = () => (
  <div className="flex items-center gap-3 text-xs text-text-muted" aria-hidden="true">
    <span className="h-px flex-1 bg-border" />
    or
    <span className="h-px flex-1 bg-border" />
  </div>
);

export const NutritionPhotoStep = ({ nameGuess, netWeightText, pendingBarcode, dispatch }: NutritionPhotoStepProps) => {
  const form = useNutritionPhotoStep(nameGuess, netWeightText, pendingBarcode, dispatch);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h2 className="text-lg font-semibold">{nameGuess}</h2>
        <p className="text-sm text-text-muted">Take a photo of its nutrition table.</p>
      </div>
      <div className="flex flex-col gap-3">
        <PhotoInput
          label="Nutrition table photo"
          hint={FRAMING_HINT}
          onSelect={form.handleSelect}
          scanningLabel={form.isLoading ? READING_LABEL : undefined}
        />
        {form.error && <InlineMessage tone="error">{form.error}</InlineMessage>}
        <p className="border-l-2 border-border pl-3 text-pretty text-sm/relaxed text-text-muted">{PER_SERVING_NOTE}</p>
      </div>
      <OrDivider />
      {/* Disabled during OCR: wizardReducer applies NUTRITION_PARSED unconditionally,
          so a tap here mid-scan would race the pending dispatch from handleSelect. */}
      <EntryOptionRow
        icon={PencilSimpleIcon}
        title={form.photo ? "Enter the values manually instead" : "Enter the values manually"}
        description={manualEntryDescription(form.photo !== null, pendingBarcode)}
        onClick={form.handleManualEntry}
        disabled={form.isLoading}
      />
    </div>
  );
};
