"use client";

import { type ChangeEvent, useState } from "react";

import { BarcodeIcon, BookmarkSimpleIcon, CameraIcon, CarrotIcon, FeatherIcon, PencilSimpleIcon, type Icon } from "@phosphor-icons/react";

import { ocrProductName } from "@/features/products/actions/ocr";
import { matchProduct, searchUserProducts } from "@/features/products/actions/products";
import type { MatchResult } from "@/features/products/actions/products";
import { lookupBarcode } from "@/features/products/actions/barcode";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { InlineMessage } from "@/components/ui/inline-message";
import { PhotoPreview, usePreviewUrl } from "@/components/ui/photo-input";
import { readBarcodeFromPhoto } from "@/components/ui/barcode-scanner";

import type { PathAction } from "../capture-wizard.path";
import { BACK_TO_OPTIONS_LABEL, type WizardAction } from "../capture-wizard.types";

interface ProductNameStepProps {
  pendingBarcode: string | null;
  hasRecipes: boolean;
  dispatch: (action: WizardAction) => void;
}

// Overlay captions, hoisted together because they are the one thing every
// path through this step shares: whichever row was tapped, the user is
// looking at their own photo with one of these written over it.
const READING_NAME_LABEL = "Reading the product name…";
const READING_BARCODE_LABEL = "Reading the barcode…";
const BARCODE_LOOKUP_LABEL = "Looking up the code…";
const SEARCHING_NAME_LABEL = "Searching your products…";

const resolveProductMatch = async (
  text: string,
  netWeightText: string | null,
  pendingBarcode: string | null,
  dispatch: (action: WizardAction) => void,
): Promise<void> => {
  const result = await matchProduct(text);
  dispatch({ type: "MATCH_RESOLVED", nameGuess: text, result, netWeightText, pendingBarcode });
};

interface ProductNameCallbacks {
  onError: (error: string | null) => void;
  // The overlay caption for the wait this path is about to start, or null
  // when it ends - the barcode row and the name row wait on different things.
  onBusy: (label: string | null) => void;
  dispatch: (action: WizardAction) => void;
  pendingBarcode: string | null;
}

const handlePhotoName = async (photo: File, callbacks: ProductNameCallbacks): Promise<void> => {
  callbacks.onError(null);
  callbacks.onBusy(READING_NAME_LABEL);
  try {
    const { text, netWeightText } = await ocrProductName(photo);
    await resolveProductMatch(text, netWeightText, callbacks.pendingBarcode, callbacks.dispatch);
  } catch {
    callbacks.onError("Could not read the product name from the photo.");
  } finally {
    callbacks.onBusy(null);
  }
};

// A typed name is a keyword, not an OCR string, so it goes through
// searchUserProducts and its hits are handed to the reducer as "ambiguous" -
// the pick list. A typed query never auto-accepts a product, however exact it
// looks: the margin rule that makes auto-accept safe is matchProduct's, and it
// scores whole strings. No photo was taken on this path, so no net weight either.
const handleManualName = async (manualName: string, callbacks: ProductNameCallbacks): Promise<void> => {
  callbacks.onError(null);
  callbacks.onBusy(SEARCHING_NAME_LABEL);
  try {
    const candidates = await searchUserProducts(manualName);
    const result: MatchResult = candidates.length === 0 ? { kind: "no_match" } : { kind: "ambiguous", candidates };
    callbacks.dispatch({
      type: "MATCH_RESOLVED",
      nameGuess: manualName,
      result,
      netWeightText: null,
      pendingBarcode: callbacks.pendingBarcode,
    });
  } catch {
    callbacks.onError("Could not search for this product name. Please try again.");
  } finally {
    callbacks.onBusy(null);
  }
};

const REJECTED_BARCODE_ERROR = "That's not a product barcode. Photograph the product name instead, or type it in.";
const BARCODE_LOOKUP_ERROR = "Could not look up this barcode. Please try again.";

const lookUpBarcode = async (code: string, callbacks: ProductNameCallbacks): Promise<void> => {
  callbacks.onBusy(BARCODE_LOOKUP_LABEL);
  try {
    const result = await lookupBarcode(code);
    if (result.kind === "rejected") {
      callbacks.onError(REJECTED_BARCODE_ERROR);
      return;
    }
    callbacks.dispatch({ type: "BARCODE_SCANNED", result });
  } catch {
    callbacks.onError(BARCODE_LOOKUP_ERROR);
  } finally {
    callbacks.onBusy(null);
  }
};

// Decoding and looking up are one wait to the user but two failures: a photo
// with no readable code never reaches the lookup, and readBarcodeFromPhoto
// words that failure itself.
const handleBarcodePhoto = async (photo: File, callbacks: ProductNameCallbacks): Promise<void> => {
  callbacks.onError(null);
  callbacks.onBusy(READING_BARCODE_LABEL);
  let code: string | null;
  try {
    code = await readBarcodeFromPhoto(photo, callbacks.onError);
  } finally {
    callbacks.onBusy(null);
  }
  if (code !== null) {
    await lookUpBarcode(code, callbacks);
  }
};

interface UseStepRequestResult {
  error: string | null;
  busyLabel: string | null;
  isLoading: boolean;
  callbacks: ProductNameCallbacks;
}

const useStepRequest = (pendingBarcode: string | null, dispatch: (action: WizardAction) => void): UseStepRequestResult => {
  const [error, setError] = useState<string | null>(null);
  const [busyLabel, setBusyLabel] = useState<string | null>(null);
  return {
    error,
    busyLabel,
    isLoading: busyLabel !== null,
    callbacks: { onError: setError, onBusy: setBusyLabel, dispatch, pendingBarcode },
  };
};

interface ManualNameEntryProps {
  manualName: string;
  error: string | null;
  isLoading: boolean;
  onChange: (value: string) => void;
  onSubmit: () => void;
  onBack: () => void;
}

const ManualNameEntry = ({ manualName, error, isLoading, onChange, onSubmit, onBack }: ManualNameEntryProps) => (
  <div className="flex flex-col gap-4">
    <h2 className="text-lg font-semibold">Type the product name</h2>
    <Field
      label="Product name"
      name="manual-product-name"
      value={manualName}
      onChange={(event) => onChange(event.target.value)}
    />
    {error && <InlineMessage tone="error">{error}</InlineMessage>}
    <Button disabled={manualName.trim() === ""} pending={isLoading} onClick={onSubmit}>
      Continue
    </Button>
    <Button variant="ghost" link onClick={onBack}>
      {BACK_TO_OPTIONS_LABEL}
    </Button>
  </div>
);

// No border-radius: this is a full-bleed list row, not a standalone control -
// rounding it would curve the divide-y hairline inward at both ends instead
// of running edge to edge, which reads as separate capsules, not one list.
// Layout only - callers add their own focus-visible (button) or focus-within
// (label wrapping a hidden input, which never receives focus itself) ring.
const OPTION_ROW_LAYOUT =
  "flex w-full cursor-pointer items-start gap-3 px-1 py-3 text-left transition-colors hover:bg-surface-raised active:bg-surface-raised";
const OPTION_ROW_BUTTON = `${OPTION_ROW_LAYOUT} focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-text disabled:opacity-50 disabled:pointer-events-none`;
const OPTION_ROW_LABEL = `${OPTION_ROW_LAYOUT} relative focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-text`;

interface EntryOptionRowProps {
  icon: Icon;
  title: string;
  description: string;
  onClick: () => void;
  disabled?: boolean;
}

const EntryOptionRow = ({ icon: RowIcon, title, description, onClick, disabled }: EntryOptionRowProps) => (
  <button type="button" onClick={onClick} disabled={disabled} className={OPTION_ROW_BUTTON}>
    <RowIcon size={24} className="mt-0.5 shrink-0 text-text-muted" aria-hidden="true" />
    <span className="flex flex-col gap-0.5">
      <span className="text-sm font-medium text-text">{title}</span>
      <span className="text-xs text-text-muted">{description}</span>
    </span>
  </button>
);

const handlePhotoRowChange = (event: ChangeEvent<HTMLInputElement>, onSelect: (photo: File) => void): void => {
  const file = event.target.files?.[0];
  if (!file) {
    return;
  }
  onSelect(file);
  event.target.value = "";
};

interface PhotoOptionRowProps {
  icon: Icon;
  title: string;
  description: string;
  /** The input's accessible name, which the visible title would otherwise
   * supply - kept separate because the title names the task ("Scan the
   * barcode") and this names the file being asked for. */
  inputLabel: string;
  isLoading: boolean;
  onSelect: (photo: File) => void;
}

// No `capture` attribute: pinning it to "environment" sends a phone straight
// into its camera app with no way back to a picture already taken, and takes
// the shot through the gallery on the way. Without it the platform offers
// camera and library together, which is the choice this row actually means.
const PhotoOptionRow = ({ icon: RowIcon, title, description, inputLabel, isLoading, onSelect }: PhotoOptionRowProps) => (
  <label className={OPTION_ROW_LABEL}>
    <RowIcon size={24} className="mt-0.5 shrink-0 text-text-muted" aria-hidden="true" />
    <span className="flex flex-col gap-0.5">
      <span className="text-sm font-medium text-text">{title}</span>
      <span className="text-xs text-text-muted">{description}</span>
    </span>
    <input
      type="file"
      accept="image/*"
      aria-label={inputLabel}
      disabled={isLoading}
      onChange={(event) => handlePhotoRowChange(event, onSelect)}
      className="absolute inset-0 cursor-pointer opacity-0 disabled:cursor-not-allowed"
    />
  </label>
);

const PHOTO_ROW_DESCRIPTION = "Reads the name off the packaging. Best when there's no barcode.";
const BARCODE_ROW_DESCRIPTION = "Photograph the code. Easiest, try this first.";

// One line above the list rather than a clause bolted onto each of the four:
// the fact is the same for all of them, and repeating it four times is how a
// list of options stops being scannable.
const ALREADY_ADDED_HINT = "Added this before? Any of these finds it — no label photo needed.";

interface PhotoNameEntryProps {
  busyLabel: string | null;
  error: string | null;
  previewUrl: string | null;
  hasRecipes: boolean;
  onSelectName: (photo: File) => void;
  onSelectBarcode: (photo: File) => void;
  onManualEntry: () => void;
  onWholeFood: () => void;
  onPickRecipe: () => void;
}

interface BarcodeAndPhotoRowsProps {
  isLoading: boolean;
  onSelectName: (photo: File) => void;
  onSelectBarcode: (photo: File) => void;
}

// Both rows open the picker from here. Scanning used to be a step of its own
// with a live camera on it, which meant a dead black rectangle wherever the
// browser had no camera to give - and a page to read and dismiss before the
// user could do the one thing the row promised.
const BarcodeAndPhotoRows = ({ isLoading, onSelectName, onSelectBarcode }: BarcodeAndPhotoRowsProps) => (
  <>
    <PhotoOptionRow
      icon={BarcodeIcon}
      title="Scan the barcode"
      description={BARCODE_ROW_DESCRIPTION}
      inputLabel="Barcode photo"
      isLoading={isLoading}
      onSelect={onSelectBarcode}
    />
    <PhotoOptionRow
      icon={CameraIcon}
      title="Photograph the product name"
      description={PHOTO_ROW_DESCRIPTION}
      inputLabel="Product photo"
      isLoading={isLoading}
      onSelect={onSelectName}
    />
  </>
);

interface ManualAndWholeFoodRowsProps {
  isLoading: boolean;
  onManualEntry: () => void;
  onWholeFood: () => void;
}

const ManualAndWholeFoodRows = ({ isLoading, onManualEntry, onWholeFood }: ManualAndWholeFoodRowsProps) => (
  <>
    <EntryOptionRow
      icon={PencilSimpleIcon}
      title="Type a packaged product's name"
      description="When the scan and the photo both come up empty."
      onClick={onManualEntry}
      disabled={isLoading}
    />
    <EntryOptionRow
      icon={CarrotIcon}
      title="Whole food, no packaging"
      description="Loose fruit, vegetables, eggs - anything with no label."
      onClick={onWholeFood}
      disabled={isLoading}
    />
  </>
);

const ADD_MEALS_TITLE = "Add meals";
const RECIPE_ROW_LOCKED_DESCRIPTION = "Save a meal as a recipe first, and it lands here.";
const RECIPE_ROW_DESCRIPTION = "Re-add a meal you already saved, in one tap.";
// Named, not inline: the row is the whole feature this cycle, and the copy is
// what tells the user it is coming rather than broken.
const LAZY_TRACK_DESCRIPTION = "Coming soon — describe a meal and get a rough estimate.";

const OPTION_GROUP_TITLE_CLASS = "px-1 pb-1 pt-4 text-xs font-medium uppercase tracking-wide text-text-muted";

interface AddMealsRowsProps {
  hasRecipes: boolean;
  isLoading: boolean;
  onPickRecipe: () => void;
}

const AddMealsRows = ({ hasRecipes, isLoading, onPickRecipe }: AddMealsRowsProps) => (
  <>
    <EntryOptionRow
      icon={BookmarkSimpleIcon}
      title="Use one of your recipes"
      description={hasRecipes ? RECIPE_ROW_DESCRIPTION : RECIPE_ROW_LOCKED_DESCRIPTION}
      onClick={onPickRecipe}
      disabled={isLoading || !hasRecipes}
    />
    {/* Placeholder only this cycle: no action, no step, no handler. */}
    <EntryOptionRow
      icon={FeatherIcon}
      title="Lazy track"
      description={LAZY_TRACK_DESCRIPTION}
      onClick={() => undefined}
      disabled
    />
  </>
);

interface EntryOptionListProps extends Omit<PhotoNameEntryProps, "busyLabel" | "error" | "previewUrl"> {
  isLoading: boolean;
}

// Two labelled groups over one divide-y list: the rows are still one list to
// scan, and the headings say which of the two things the user is adding.
const EntryOptionList = ({ isLoading, hasRecipes, onSelectName, onSelectBarcode, onManualEntry, onWholeFood, onPickRecipe }: EntryOptionListProps) => (
  <div className="flex flex-col">
    <div className="flex flex-col divide-y divide-border">
      <BarcodeAndPhotoRows isLoading={isLoading} onSelectName={onSelectName} onSelectBarcode={onSelectBarcode} />
      <ManualAndWholeFoodRows isLoading={isLoading} onManualEntry={onManualEntry} onWholeFood={onWholeFood} />
    </div>
    <h3 className={OPTION_GROUP_TITLE_CLASS}>{ADD_MEALS_TITLE}</h3>
    <div className="flex flex-col divide-y divide-border">
      <AddMealsRows hasRecipes={hasRecipes} isLoading={isLoading} onPickRecipe={onPickRecipe} />
    </div>
  </div>
);

// The option rows are all disabled while the photo is read, so showing the
// photo beats four dead rows and a 12px spinner. The caption names the wait
// the tapped row started - reading a name, reading a code, looking one up.
const PhotoEntryBody = ({ busyLabel, previewUrl, hasRecipes, onSelectName, onSelectBarcode, onManualEntry, onWholeFood, onPickRecipe }: Omit<PhotoNameEntryProps, "error">) =>
  busyLabel && previewUrl ? (
    <PhotoPreview previewUrl={previewUrl} scanningLabel={busyLabel} />
  ) : (
    <EntryOptionList
      isLoading={busyLabel !== null}
      hasRecipes={hasRecipes}
      onSelectName={onSelectName}
      onSelectBarcode={onSelectBarcode}
      onManualEntry={onManualEntry}
      onWholeFood={onWholeFood}
      onPickRecipe={onPickRecipe}
    />
  );

const PhotoNameEntry = ({ error, ...body }: PhotoNameEntryProps) => (
  <div className="flex flex-col gap-4">
    <div className="flex flex-col gap-1">
      <h2 className="text-lg font-semibold">Add a product</h2>
      <p className="text-sm text-text-muted">{ALREADY_ADDED_HINT}</p>
    </div>
    <PhotoEntryBody {...body} />
    {error && <InlineMessage tone="error">{error}</InlineMessage>}
  </div>
);

export const ProductNameStep = ({ pendingBarcode, hasRecipes, dispatch }: ProductNameStepProps) => {
  const { error, busyLabel, callbacks } = useStepRequest(pendingBarcode, dispatch);
  const { previewUrl, showPreview } = usePreviewUrl();

  return (
    <PhotoNameEntry
      busyLabel={busyLabel}
      error={error}
      previewUrl={previewUrl}
      hasRecipes={hasRecipes}
      onSelectName={(photo) => {
        showPreview(photo);
        void handlePhotoName(photo, callbacks);
      }}
      onSelectBarcode={(photo) => {
        showPreview(photo);
        void handleBarcodePhoto(photo, callbacks);
      }}
      onManualEntry={() => dispatch({ type: "MANUAL_NAME_ENTRY", pendingBarcode })}
      onWholeFood={() => dispatch({ type: "WHOLE_FOOD_SEARCH" })}
      onPickRecipe={() => dispatch({ type: "RECIPE_PICK_OPENED" })}
    />
  );
};

interface ProductSubStepProps {
  pendingBarcode: string | null;
  dispatch: (action: PathAction) => void;
}

export const ManualNameStep = ({ pendingBarcode, dispatch }: ProductSubStepProps) => {
  const { error, isLoading, callbacks } = useStepRequest(pendingBarcode, dispatch);
  const [manualName, setManualName] = useState("");

  return (
    <ManualNameEntry
      manualName={manualName}
      error={error}
      isLoading={isLoading}
      onChange={setManualName}
      onSubmit={() => void handleManualName(manualName, callbacks)}
      onBack={() => dispatch({ type: "BACK" })}
    />
  );
};

