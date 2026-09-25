"use client";

import { useEffect, useState } from "react";

import { estimateMeal, logLazyMeal, type EstimateMealResult, type LogLazyMealResult } from "@/features/lazy-track/actions/lazy-track";
import { canEstimate, DESCRIPTION_MAX_LENGTH, isDescriptionTooLong, type MealEstimateView } from "@/features/lazy-track/actions/lazy-track.utils";
import { Button } from "@/components/ui/button";
import { CheckboxRow } from "@/components/ui/checkbox-row";
import { Field, TextAreaField } from "@/components/ui/field";
import { InlineMessage } from "@/components/ui/inline-message";
import { PhotoInput } from "@/components/ui/photo-input";

import type { PathAction } from "../capture-wizard.path";
import { BACK_TO_OPTIONS_LABEL } from "../capture-wizard.types";
import { hasAcceptedAiPhotoConsent, recordAiPhotoConsent } from "./ai-photo-consent";
import { AiConsentSheet } from "./amount-photo-field";
import { reviewDraftIsLoggable, rowKcal, toLoggedItems, toReviewRows, type ReviewRow } from "./lazy-track-steps.utils";

const DISCLAIMER = "Least accurate way to log. Better than nothing — for exact figures use a label, barcode or search.";
const DESCRIPTION_LABEL = "What did you eat, and what was in it?";
const DESCRIPTION_HINT = "More detail, better estimate — portion size, cooking oil, sauces.";
const PHOTO_LABEL = "Photo of the meal (optional, helps a lot)";
const TOO_LONG_ERROR = `Keep it under ${DESCRIPTION_MAX_LENGTH} characters.`;
const ESTIMATE_FAILED = "Estimate unavailable right now. Your text is kept — try again, or add items by search.";

const ESTIMATE_ERRORS: Record<Exclude<EstimateMealResult["kind"], "estimated">, string> = {
  nothing_found: "Couldn't pick out any food — say what was on the plate.",
  photo_unreadable: "That photo format can't be read — use JPEG, PNG or WebP, or leave the photo out.",
  unavailable: ESTIMATE_FAILED,
};

interface LazyDescribeStepProps {
  description: string;
  photo: File | null;
  dispatch: (action: PathAction) => void;
}

// Consent gates the request, not the photo: the description goes to Gemini
// too, so a text-only estimate asks first as well.
const useEstimate = (dispatch: (action: PathAction) => void) => {
  const [isEstimating, setIsEstimating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [consentOpen, setConsentOpen] = useState(false);

  const run = async (description: string, photo: File | null) => {
    setError(null);
    setIsEstimating(true);
    try {
      const result = await estimateMeal(description, photo);
      if (result.kind === "estimated") {
        dispatch({ type: "LAZY_ESTIMATED", description, photo, estimate: result.estimate });
        return;
      }
      setError(ESTIMATE_ERRORS[result.kind]);
    } catch (caught) {
      console.error("estimateMeal failed", caught);
      setError(ESTIMATE_FAILED);
    } finally {
      setIsEstimating(false);
    }
  };

  const request = (description: string, photo: File | null) =>
    hasAcceptedAiPhotoConsent() ? void run(description, photo) : setConsentOpen(true);

  const agree = (description: string, photo: File | null) => {
    recordAiPhotoConsent();
    setConsentOpen(false);
    void run(description, photo);
  };

  return { isEstimating, error, consentOpen, request, agree, decline: () => setConsentOpen(false) };
};

// The shell's own <h1> already reads "Lazy track" (STEP_TITLES) for this
// step, so no second heading repeats it here - unlike the review step below,
// nothing on this screen needs a heading of its own.
export const LazyDescribeStep = ({ description: initialDescription, photo: initialPhoto, dispatch }: LazyDescribeStepProps) => {
  const [description, setDescription] = useState(initialDescription);
  const [photo, setPhoto] = useState<File | null>(initialPhoto);
  const [photoKey, setPhotoKey] = useState(0);
  const estimate = useEstimate(dispatch);
  const tooLong = isDescriptionTooLong(description);

  return (
    <div className="flex flex-col gap-4">
      <InlineMessage tone="info">{DISCLAIMER}</InlineMessage>
      <TextAreaField
        label={DESCRIPTION_LABEL}
        name="lazy-description"
        value={description}
        onChange={(event) => setDescription(event.target.value)}
        helperText={DESCRIPTION_HINT}
        error={tooLong ? TOO_LONG_ERROR : undefined}
        maxLength={DESCRIPTION_MAX_LENGTH + 1}
      />
      <PhotoInput key={photoKey} label={PHOTO_LABEL} onSelect={setPhoto} />
      {/* PhotoInput previews only what it picked itself; a photo carried back
          by "Add detail" needs saying. */}
      {photo && photo === initialPhoto && <InlineMessage tone="info">Photo attached.</InlineMessage>}
      {photo && (
        <Button variant="ghost" link onClick={() => { setPhoto(null); setPhotoKey((key) => key + 1); }}>
          Remove photo
        </Button>
      )}
      {estimate.error && <InlineMessage tone="error">{estimate.error}</InlineMessage>}
      <Button disabled={!canEstimate(description, photo !== null)} pending={estimate.isEstimating} onClick={() => estimate.request(description, photo)}>
        Estimate
      </Button>
      <Button variant="ghost" link onClick={() => dispatch({ type: "BACK" })}>
        {BACK_TO_OPTIONS_LABEL}
      </Button>
      <AiConsentSheet open={estimate.consentOpen} onAgree={() => estimate.agree(description, photo)} onDecline={estimate.decline} />
    </div>
  );
};

const LOG_FAILED = "Couldn't log it. Try again.";

const LOG_ERRORS: Record<Exclude<LogLazyMealResult["kind"], "logged">, string> = {
  invalid_items: "Something in this estimate doesn't add up — estimate again.",
  invalid_recipe_name: "Give the recipe a name.",
  meal_missing: "This meal is gone. Nothing was logged.",
};

interface LazyReviewStepProps {
  mealId: string;
  estimate: MealEstimateView;
  onLogged: () => void;
  dispatch: (action: PathAction) => void;
}

const ReviewRowView = ({ row, index, onGrams, onRemove }: { row: ReviewRow; index: number; onGrams: (text: string) => void; onRemove: () => void }) => {
  const kcal = rowKcal(row);
  return (
    <div className="flex flex-col gap-2 py-3">
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm font-medium text-text">{row.item.name}</span>
        <Button variant="danger" link aria-label={`Remove ${row.item.name}`} onClick={onRemove}>
          Remove
        </Button>
      </div>
      <Field
        label="Grams"
        name={`lazy-grams-${index}`}
        inputMode="decimal"
        value={row.gramsText}
        onChange={(event) => onGrams(event.target.value)}
        error={kcal === null ? "Enter an amount above 0." : undefined}
        helperText={kcal === null ? undefined : `About ${Math.round(kcal)} kcal`}
      />
    </div>
  );
};

const useLog = (mealId: string, onLogged: () => void) => {
  const [isLogging, setIsLogging] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const log = async (rows: readonly ReviewRow[], recipeName: string | null) => {
    setError(null);
    setIsLogging(true);
    try {
      const result = await logLazyMeal(mealId, toLoggedItems(rows), recipeName);
      if (result.kind === "logged") {
        onLogged();
        return;
      }
      setError(LOG_ERRORS[result.kind]);
    } catch (caught) {
      console.error("logLazyMeal failed", caught);
      setError(LOG_FAILED);
    } finally {
      setIsLogging(false);
    }
  };

  return { isLogging, error, log };
};

// A document listener, not the step's own root-div onKeyDown: AnimatedStep
// (capture-wizard.tsx) moves focus to its own ancestor on step change, so a
// keydown on this div never fires - it bubbles up, not down, from wherever
// focus actually landed. Skips an already-handled key so a future Sheet's
// own Escape isn't double-fired.
const useEscapeToGoBack = (dispatch: (action: PathAction) => void) => {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !event.defaultPrevented) dispatch({ type: "BACK" });
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [dispatch]);
};

// Rows and their derived total, split out of LazyReviewStep so that
// component's own body stays under the complexity threshold without a third
// eslint-disable directive (CLAUDE.md caps that at two, both already spent).
const useReviewRows = (estimate: MealEstimateView) => {
  const [rows, setRows] = useState(() => toReviewRows(estimate.items));
  const setGrams = (index: number, gramsText: string) => setRows((current) => current.map((row, at) => (at === index ? { ...row, gramsText } : row)));
  const remove = (index: number) => setRows((current) => current.filter((_, at) => at !== index));
  const totalKcal = rows.reduce((sum, row) => sum + (rowKcal(row) ?? 0), 0);
  return { rows, setGrams, remove, totalKcal };
};

export const LazyReviewStep = ({ mealId, estimate, onLogged, dispatch }: LazyReviewStepProps) => {
  const { rows, setGrams, remove, totalKcal } = useReviewRows(estimate);
  const [saveRecipe, setSaveRecipe] = useState(false);
  const [recipeName, setRecipeName] = useState(estimate.mealName);
  const logging = useLog(mealId, onLogged);
  useEscapeToGoBack(dispatch);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h2 className="text-lg font-semibold">{estimate.mealName}</h2>
        <p className="tabular-nums text-sm text-text-muted">Rough estimate · about {Math.round(totalKcal)} kcal</p>
      </div>
      <div className="flex flex-col divide-y divide-border">
        {rows.map((row, index) => (
          <ReviewRowView key={`${row.item.name}-${index}`} row={row} index={index} onGrams={(text) => setGrams(index, text)} onRemove={() => remove(index)} />
        ))}
      </div>
      <Button variant="ghost" link onClick={() => dispatch({ type: "BACK" })}>
        Something missing? Add detail
      </Button>
      <CheckboxRow name="lazy-save-recipe" label="Save as recipe" checked={saveRecipe} onChange={setSaveRecipe} />
      {saveRecipe && <Field label="Recipe name" name="lazy-recipe-name" value={recipeName} onChange={(event) => setRecipeName(event.target.value)} />}
      {logging.error && <InlineMessage tone="error">{logging.error}</InlineMessage>}
      <Button disabled={!reviewDraftIsLoggable(rows)} pending={logging.isLogging} onClick={() => void logging.log(rows, saveRecipe ? recipeName : null)}>
        Log
      </Button>
    </div>
  );
};
