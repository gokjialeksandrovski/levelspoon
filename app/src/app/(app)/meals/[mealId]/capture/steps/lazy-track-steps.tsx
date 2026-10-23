"use client";

import { XIcon } from "@phosphor-icons/react";
import { useEffect, useState } from "react";

import { estimateMeal, logLazyMeal, type EstimateMealResult, type LogLazyMealResult } from "@/features/lazy-track/actions/lazy-track";
import { canEstimate, DESCRIPTION_MAX_LENGTH, isDescriptionTooLong, type MealEstimateView } from "@/features/lazy-track/actions/lazy-track.utils";
import { Button } from "@/components/ui/button";
import { FigureField, TextAreaField } from "@/components/ui/field";
import { InlineMessage } from "@/components/ui/inline-message";
import { AttachedPhoto, PhotoInput } from "@/components/ui/photo-input";
import { StickyActionBar } from "@/components/ui/sticky-action-bar";
import { ICON_TAP_TARGET_CLASS } from "@/components/ui/tap-target";

import type { PathAction } from "../capture-wizard.path";
import { hasAcceptedAiPhotoConsent, recordAiPhotoConsent } from "./ai-photo-consent";
import { AiConsentSheet } from "./amount-photo-field";
import { gramsFieldError, reviewDraftIsLoggable, rowKcal, toLoggedItems, toReviewRows, type ReviewRow } from "./lazy-track-steps.utils";

const DESCRIPTION_LABEL = "What did you eat, and what was in it?";
const DESCRIPTION_HINT = "More detail gives a better estimate, e.g. portion size, cooking oil, sauces.";
const PHOTO_LABEL = "Photo of the meal (optional, helps a lot)";
const ATTACHED_PHOTO_LABEL = "Photo of the meal";
const TOO_LONG_ERROR = `Keep it under ${DESCRIPTION_MAX_LENGTH} characters.`;
const ESTIMATE_FAILED = "Estimate unavailable right now. Your text is kept, so try again or add items by search.";
const NOTHING_TO_ESTIMATE = "Describe the meal or add a photo first.";

const ESTIMATE_ERRORS: Record<Exclude<EstimateMealResult["kind"], "estimated">, string> = {
  nothing_found: "Couldn't pick out any food. Say what was on the plate.",
  photo_unreadable: "That photo format can't be read. Use JPEG, PNG or WebP, or leave the photo out.",
  unavailable: ESTIMATE_FAILED,
};

interface LazyDescribeStepProps {
  description: string;
  photo: File | null;
  previous: MealEstimateView | null;
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

  // Validated on tap rather than by disabling Estimate, so the tap says why.
  const request = (description: string, photo: File | null) => {
    if (!canEstimate(description, photo !== null)) {
      setError(isDescriptionTooLong(description) ? TOO_LONG_ERROR : NOTHING_TO_ESTIMATE);
      return;
    }
    if (hasAcceptedAiPhotoConsent()) void run(description, photo);
    else setConsentOpen(true);
  };

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
export const LazyDescribeStep = ({ description: initialDescription, photo: initialPhoto, previous, dispatch }: LazyDescribeStepProps) => {
  const [description, setDescription] = useState(initialDescription);
  const [photo, setPhoto] = useState<File | null>(initialPhoto);
  const estimate = useEstimate(dispatch);
  const tooLong = isDescriptionTooLong(description);

  return (
    <div className="flex flex-col gap-4">
      <TextAreaField
        label={DESCRIPTION_LABEL}
        name="lazy-description"
        value={description}
        onChange={(event) => setDescription(event.target.value)}
        helperText={DESCRIPTION_HINT}
        error={tooLong ? TOO_LONG_ERROR : undefined}
        maxLength={DESCRIPTION_MAX_LENGTH + 1}
      />
      {photo ? <AttachedPhoto photo={photo} label={ATTACHED_PHOTO_LABEL} onRemove={() => setPhoto(null)} /> : <PhotoInput label={PHOTO_LABEL} onSelect={setPhoto} />}
      {estimate.error && <InlineMessage tone="error">{estimate.error}</InlineMessage>}
      <Button pending={estimate.isEstimating} onClick={() => estimate.request(description, photo)}>
        Estimate
      </Button>
      {/* Add detail's exit (Rule 21): back to the estimate it left, as
          Gemini gave it, with the text and photo that produced it and no
          second request. Edits made here are dropped with it. */}
      {previous && (
        <Button
          variant="ghost"
          disabled={estimate.isEstimating}
          onClick={() => dispatch({ type: "LAZY_ESTIMATED", description: initialDescription, photo: initialPhoto, estimate: previous })}
        >
          Actually, don&apos;t add more detail
        </Button>
      )}
      <AiConsentSheet open={estimate.consentOpen} onAgree={() => estimate.agree(description, photo)} onDecline={estimate.decline} />
    </div>
  );
};

const LOG_FAILED = "Couldn't log it. Try again.";
const NOTHING_TO_LOG = "Nothing left to log. Add detail to estimate again.";
const FIX_AMOUNTS = "Fix the amounts marked above first.";

const LOG_ERRORS: Record<Exclude<LogLazyMealResult["kind"], "logged">, string> = {
  invalid_items: "Something in this estimate doesn't add up. Estimate again.",
  meal_missing: "This meal is gone. Nothing was logged.",
};

interface LazyReviewStepProps {
  mealId: string;
  estimate: MealEstimateView;
  onLogged: () => void;
  dispatch: (action: PathAction) => void;
}

// Same row as the confirm step's nutrition table: name and what it works out
// to on the left, the one editable figure on the right, so five items fit a
// phone screen. Icon-only remove, like the other row-level icon controls.
const ReviewRowView = ({ row, index, onGrams, onRemove }: { row: ReviewRow; index: number; onGrams: (text: string) => void; onRemove: () => void }) => {
  const kcal = rowKcal(row);
  return (
    <FigureField
      label={
        <>
          {row.item.name}
          <span className="sr-only">, grams</span>
        </>
      }
      name={`lazy-grams-${index}`}
      unit="g"
      value={row.gramsText}
      onChange={(event) => onGrams(event.target.value)}
      detail={kcal === null ? undefined : `About ${Math.round(kcal)} kcal`}
      error={gramsFieldError(row.gramsText)}
      action={
        <button type="button" aria-label={`Remove ${row.item.name}`} onClick={onRemove} className={`${ICON_TAP_TARGET_CLASS} -mr-2.5 text-text-muted`}>
          <XIcon weight="regular" />
        </button>
      }
    />
  );
};

const useLog = (mealId: string, onLogged: () => void) => {
  const [isLogging, setIsLogging] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const log = async (rows: readonly ReviewRow[]) => {
    if (!reviewDraftIsLoggable(rows)) {
      setError(rows.length === 0 ? NOTHING_TO_LOG : FIX_AMOUNTS);
      return;
    }
    setError(null);
    setIsLogging(true);
    try {
      const result = await logLazyMeal(mealId, toLoggedItems(rows));
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
// own Escape isn't double-fired. Disabled while logging is in flight: the
// write is already underway, so leaving now would not stop it, only race it -
// the user would land back on describe while their meal still gets logged.
const useEscapeToGoBack = (dispatch: (action: PathAction) => void, disabled: boolean) => {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !event.defaultPrevented && !disabled) dispatch({ type: "BACK" });
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [dispatch, disabled]);
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

// Add detail sits beside Log, not as a link in the body: it is the other way
// out of this screen, and a pair reads as "this, or that" at a glance.
export const LazyReviewStep = ({ mealId, estimate, onLogged, dispatch }: LazyReviewStepProps) => {
  const { rows, setGrams, remove, totalKcal } = useReviewRows(estimate);
  const logging = useLog(mealId, onLogged);
  useEscapeToGoBack(dispatch, logging.isLogging);

  return (
    <div className="flex flex-col gap-6">
      <section aria-labelledby="lazy-review-heading" className="flex flex-col">
        <div className="flex flex-col gap-0.5 border-b-2 border-text pb-2">
          <h2 id="lazy-review-heading" className="wrap-break-word text-base font-semibold">
            {estimate.mealName}
          </h2>
          <p className="text-sm tabular-nums text-text-muted">Rough estimate · about {Math.round(totalKcal)} kcal</p>
        </div>
        <div className="flex flex-col divide-y divide-border">
          {rows.map((row, index) => (
            <ReviewRowView key={`${row.item.name}-${index}`} row={row} index={index} onGrams={(text) => setGrams(index, text)} onRemove={() => remove(index)} />
          ))}
        </div>
      </section>
      <StickyActionBar>
        {logging.error && <InlineMessage tone="error">{logging.error}</InlineMessage>}
        <div className="flex gap-3">
          <Button variant="ghost" disabled={logging.isLogging} onClick={() => dispatch({ type: "BACK" })}>
            Add detail
          </Button>
          <Button className="flex-1" pending={logging.isLogging} onClick={() => void logging.log(rows)}>
            Log
          </Button>
        </div>
      </StickyActionBar>
    </div>
  );
};
