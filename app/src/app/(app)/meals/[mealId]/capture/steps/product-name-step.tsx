"use client";

import { type ChangeEvent, useState } from "react";

import { BarcodeIcon, BookmarkSimpleIcon, CameraIcon, CarrotIcon, FeatherIcon, PencilSimpleIcon, type Icon } from "@phosphor-icons/react";

import { DEMO_SCAN_LIMIT_MESSAGE } from "@/features/demo/demo.messages";
import { useIsGuest } from "@/features/demo/hooks/use-is-guest";
import { ocrProductName } from "@/features/products/actions/ocr";
import { matchProduct, searchUserProducts } from "@/features/products/actions/products";
import type { MatchResult } from "@/features/products/actions/products";
import { lookupBarcode } from "@/features/products/actions/barcode";
import { UNREADABLE_PHOTO_MESSAGE } from "@/features/products/products.messages";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { InlineMessage } from "@/components/ui/inline-message";
import { PhotoPreview, PhotoSourceDivider, SavedPhotoButton, takePickedPhoto, usePreviewUrl } from "@/components/ui/photo-input";
import { readBarcodeFromPhoto } from "@/lib/barcode/read-photo";

import type { PathAction } from "../capture-wizard.path";
import type { WizardAction } from "../capture-wizard.types";

interface ProductNameStepProps {
  pendingBarcode: string | null;
  hasRecipes: boolean;
  /** Copied ingredients, first thing a thumb reaches on a new meal. */
  pasteArea: React.ReactNode;
  dispatch: (action: WizardAction) => void;
}

// Overlay captions, hoisted together because they are the one thing every
// path through this step shares: whichever row was tapped, the user is
// looking at their own photo with one of these written over it.
const READING_NAME_LABEL = "Reading the product name…";
const READING_BARCODE_LABEL = "Reading the barcode…";
const BARCODE_LOOKUP_LABEL = "Looking up the barcode…";
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
    const read = await ocrProductName(photo);
    if (read.kind === "demo-limit") {
      callbacks.onError(DEMO_SCAN_LIMIT_MESSAGE);
      return;
    }
    if (read.kind === "unreadable-photo") {
      callbacks.onError(UNREADABLE_PHOTO_MESSAGE);
      return;
    }
    await resolveProductMatch(read.text, read.netWeightText, callbacks.pendingBarcode, callbacks.dispatch);
  } catch {
    callbacks.onError(
      "Couldn't read a name in that photo. Try a closer shot, or type the name.",
    );
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
  if (manualName.trim() === "") {
    callbacks.onError("Type a product name first.");
    return;
  }
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
    callbacks.onError("Couldn't search for that name. Please try again.");
  } finally {
    callbacks.onBusy(null);
  }
};

const REJECTED_BARCODE_ERROR =
  "That's not a product barcode. Take a photo of the product name instead, or type it.";
const BARCODE_LOOKUP_ERROR = "Couldn't look up that barcode. Please try again.";

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
}

// A form so Enter in the field searches, same as tapping the button.
const ManualNameEntry = ({ manualName, error, isLoading, onChange, onSubmit }: ManualNameEntryProps) => (
  <form
    className="flex flex-col gap-4"
    onSubmit={(event) => {
      event.preventDefault();
      if (!isLoading) onSubmit();
    }}
  >
    <h2 className="text-lg font-semibold">Type the product name</h2>
    <Field
      label="Product name"
      name="manual-product-name"
      value={manualName}
      onChange={(event) => onChange(event.target.value)}
    />
    {error && <InlineMessage tone="error">{error}</InlineMessage>}
    <Button type="submit" pending={isLoading}>
      Search my products
    </Button>
  </form>
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

export const EntryOptionRow = ({
  icon: RowIcon,
  title,
  description,
  onClick,
  disabled,
}: EntryOptionRowProps) => (
  <button
    type="button"
    onClick={onClick}
    disabled={disabled}
    className={OPTION_ROW_BUTTON}
  >
    <RowIcon
      size={24}
      className="mt-0.5 shrink-0 text-text-muted"
      aria-hidden="true"
    />
    <span className="flex flex-col gap-0.5">
      <span className="text-sm font-medium text-text">{title}</span>
      <span className="text-xs text-text-muted">{description}</span>
    </span>
  </button>
);

interface PhotoOptionRowProps {
  icon: Icon;
  title: string;
  description: string;
  /** The input's accessible name, which the visible title would otherwise
   * supply - kept separate because the title names the task ("Scan the
   * barcode") and this names the file being asked for. */
  inputLabel: string;
  /** What the saved-photo link's accessible name says the photo is of. */
  subject: string;
  isLoading: boolean;
  onSelect: (photo: File) => void;
}

// Split row: the row opens the camera directly, so the gallery needs a
// second input (see SavedPhotoButton), docked at the row's end.
const PhotoOptionRow = ({ icon: RowIcon, title, description, inputLabel, subject, isLoading, onSelect }: PhotoOptionRowProps) => {
  const handleChange = (event: ChangeEvent<HTMLInputElement>) => takePickedPhoto(event, onSelect);
  return (
    <div className="flex items-stretch">
      <label className={`${OPTION_ROW_LABEL} min-w-0 flex-1`}>
        <RowIcon size={24} className="mt-0.5 shrink-0 text-text-muted" aria-hidden="true" />
        <span className="flex flex-col gap-0.5">
          <span className="text-sm font-medium text-text">{title}</span>
          <span className="text-xs text-text-muted">{description}</span>
        </span>
        <input
          type="file"
          accept="image/*"
          capture="environment"
          aria-label={inputLabel}
          disabled={isLoading}
          onChange={handleChange}
          className="absolute inset-0 cursor-pointer opacity-0 disabled:cursor-not-allowed"
        />
      </label>
      <PhotoSourceDivider />
      <SavedPhotoButton subject={subject} disabled={isLoading} onChange={handleChange} className="hover:bg-surface-raised active:bg-surface-raised" />
    </div>
  );
};

const PHOTO_ROW_DESCRIPTION =
  "For when the barcode isn't found. We read the name off the package, then you add the nutrition values from a label photo or by hand.";
const BARCODE_ROW_DESCRIPTION =
  "Take a photo of the barcode. It's the quickest, so start here.";

// One line above the list rather than a clause bolted onto each of the four:
// the fact is the same for all of them, and repeating it four times is how a
// list of options stops being scannable.
const ADD_PRODUCT_TITLE = "Add a product to a meal";
const ADD_PRODUCT_DESCRIPTION =
  "If we already have the product, or you've added it before, any of these takes you straight to the amount.";

interface PhotoNameEntryProps {
  busyLabel: string | null;
  error: string | null;
  previewUrl: string | null;
  hasRecipes: boolean;
  pasteArea: React.ReactNode;
  onSelectName: (photo: File) => void;
  onSelectBarcode: (photo: File) => void;
  onManualEntry: () => void;
  onWholeFood: () => void;
  onPickRecipe: () => void;
  onLazyTrack: () => void;
}

interface BarcodeAndPhotoRowsProps {
  isLoading: boolean;
  onSelectName: (photo: File) => void;
  onSelectBarcode: (photo: File) => void;
}

// Both rows open the picker from here, not a live-camera step: that would be
// a dead black rectangle wherever the browser has no camera to give, and a
// page to read and dismiss before the user could do the one thing the row
// promised.
const BarcodeAndPhotoRows = ({ isLoading, onSelectName, onSelectBarcode }: BarcodeAndPhotoRowsProps) => (
  <>
    <PhotoOptionRow
      icon={BarcodeIcon}
      title="Scan the barcode"
      description={BARCODE_ROW_DESCRIPTION}
      inputLabel="Barcode photo"
      subject="the barcode"
      isLoading={isLoading}
      onSelect={onSelectBarcode}
    />
    <PhotoOptionRow
      icon={CameraIcon}
      title="Photograph the product name"
      description={PHOTO_ROW_DESCRIPTION}
      inputLabel="Product photo"
      subject="the product"
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

const ManualAndWholeFoodRows = ({
  isLoading,
  onManualEntry,
  onWholeFood,
}: ManualAndWholeFoodRowsProps) => (
  <>
    <EntryOptionRow
      icon={PencilSimpleIcon}
      title="Type a packaged product's name"
      description="When you know we already have it and would rather type the name."
      onClick={onManualEntry}
      disabled={isLoading}
    />
    <EntryOptionRow
      icon={CarrotIcon}
      title="Whole food, no packaging"
      description="Fruit, vegetables, eggs, anything without a label."
      onClick={onWholeFood}
      disabled={isLoading}
    />
  </>
);

const ADD_MEAL_TITLE = "Add a meal";
const ADD_MEAL_DESCRIPTION =
  "Log everything you ate in one go. Pick a saved recipe or describe the meal.";
const RECIPE_ROW_LOCKED_DESCRIPTION =
  "Save a meal as a recipe and it shows up here.";
const RECIPE_ROW_DESCRIPTION = "Add a meal you saved before, in one tap.";
const LAZY_TRACK_DESCRIPTION =
  "Describe your meal and AI makes a rough guess. Add detail to sharpen it.";

interface AddMealsRowsProps {
  hasRecipes: boolean;
  isLoading: boolean;
  onPickRecipe: () => void;
  onLazyTrack: () => void;
}

const LAZY_TRACK_DEMO_DESCRIPTION = "Needs AI, which the demo leaves out. Self-host with your own AI key to use it.";

const AddMealsRows = ({ hasRecipes, isLoading, onPickRecipe, onLazyTrack }: AddMealsRowsProps) => {
  const isGuest = useIsGuest();
  return (
    <>
      <EntryOptionRow
        icon={BookmarkSimpleIcon}
        title="Use one of your recipes"
        description={hasRecipes ? RECIPE_ROW_DESCRIPTION : RECIPE_ROW_LOCKED_DESCRIPTION}
        onClick={onPickRecipe}
        disabled={isLoading || !hasRecipes}
      />
      <EntryOptionRow
        icon={FeatherIcon}
        title="Lazy track"
        description={isGuest ? LAZY_TRACK_DEMO_DESCRIPTION : LAZY_TRACK_DESCRIPTION}
        onClick={onLazyTrack}
        disabled={isLoading || isGuest}
      />
    </>
  );
};

interface OptionSectionProps {
  title: string;
  description: string;
  children: React.ReactNode;
}

// Both groups share one heading shape: adding a product and adding a whole
// meal are peers, and order alone says which one comes first.
const OptionSection = ({
  title,
  description,
  children,
}: OptionSectionProps) => (
  <section className="flex flex-col gap-3">
    <div className="flex flex-col gap-1">
      <h2 className="text-lg font-semibold">{title}</h2>
      <p className="text-pretty text-sm text-text-muted">{description}</p>
    </div>
    <div className="flex flex-col divide-y divide-border">{children}</div>
  </section>
);

interface EntryOptionListProps extends Omit<PhotoNameEntryProps, "busyLabel" | "error" | "previewUrl"> {
  isLoading: boolean;
}

const EntryOptionList = ({
  isLoading,
  hasRecipes,
  pasteArea,
  onSelectName,
  onSelectBarcode,
  onManualEntry,
  onWholeFood,
  onPickRecipe,
  onLazyTrack,
}: EntryOptionListProps) => (
  <div className="flex flex-col gap-8">
    {pasteArea}
    <OptionSection
      title={ADD_PRODUCT_TITLE}
      description={ADD_PRODUCT_DESCRIPTION}
    >
      <BarcodeAndPhotoRows
        isLoading={isLoading}
        onSelectName={onSelectName}
        onSelectBarcode={onSelectBarcode}
      />
      <ManualAndWholeFoodRows
        isLoading={isLoading}
        onManualEntry={onManualEntry}
        onWholeFood={onWholeFood}
      />
    </OptionSection>
    <OptionSection title={ADD_MEAL_TITLE} description={ADD_MEAL_DESCRIPTION}>
      <AddMealsRows
        hasRecipes={hasRecipes}
        isLoading={isLoading}
        onPickRecipe={onPickRecipe}
        onLazyTrack={onLazyTrack}
      />
    </OptionSection>
  </div>
);

// The option rows are all disabled while the photo is read, so showing the
// photo beats four dead rows and a 12px spinner. The caption names the wait
// the tapped row started - reading a name, reading a code, looking one up.
const PhotoEntryBody = ({ busyLabel, previewUrl, hasRecipes, pasteArea, onSelectName, onSelectBarcode, onManualEntry, onWholeFood, onPickRecipe, onLazyTrack }: Omit<PhotoNameEntryProps, "error">) =>
  busyLabel && previewUrl ? (
    <PhotoPreview previewUrl={previewUrl} scanningLabel={busyLabel} />
  ) : (
    <EntryOptionList
      isLoading={busyLabel !== null}
      hasRecipes={hasRecipes}
      pasteArea={pasteArea}
      onSelectName={onSelectName}
      onSelectBarcode={onSelectBarcode}
      onManualEntry={onManualEntry}
      onWholeFood={onWholeFood}
      onPickRecipe={onPickRecipe}
      onLazyTrack={onLazyTrack}
    />
  );

const PhotoNameEntry = ({ error, ...body }: PhotoNameEntryProps) => (
  <div className="flex flex-col gap-4">
    <PhotoEntryBody {...body} />
    {error && <InlineMessage tone="error">{error}</InlineMessage>}
  </div>
);

export const ProductNameStep = ({ pendingBarcode, hasRecipes, pasteArea, dispatch }: ProductNameStepProps) => {
  const { error, busyLabel, callbacks } = useStepRequest(pendingBarcode, dispatch);
  const { previewUrl, showPreview } = usePreviewUrl();

  return (
    <PhotoNameEntry
      busyLabel={busyLabel}
      error={error}
      previewUrl={previewUrl}
      hasRecipes={hasRecipes}
      pasteArea={pasteArea}
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
      onLazyTrack={() => dispatch({ type: "LAZY_TRACK_OPENED" })}
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
    />
  );
};

