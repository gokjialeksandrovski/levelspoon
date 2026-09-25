"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { estimateMeal, type EstimateMealResult } from "@/features/lazy-track/actions/lazy-track";
import { canEstimate, DESCRIPTION_MAX_LENGTH, ESTIMATE_PARAM, isDescriptionTooLong } from "@/features/lazy-track/actions/lazy-track.utils";
import { Button } from "@/components/ui/button";
import { TextAreaField } from "@/components/ui/field";
import { InlineMessage } from "@/components/ui/inline-message";
import { PhotoInput } from "@/components/ui/photo-input";

import type { PathAction } from "../capture-wizard.path";
import { BACK_TO_OPTIONS_LABEL } from "../capture-wizard.types";
import { hasAcceptedAiPhotoConsent, recordAiPhotoConsent } from "./ai-photo-consent";
import { AiConsentSheet } from "./amount-photo-field";

const DISCLAIMER = "Least accurate way to log. Better than nothing — for exact figures use a label, barcode or search.";
const DESCRIPTION_LABEL = "What did you eat, and what was in it?";
const DESCRIPTION_HINT = "More detail, better estimate — portion size, cooking oil, sauces.";
const PHOTO_LABEL = "Photo of the meal (optional, helps a lot)";
const TOO_LONG_ERROR = `Keep it under ${DESCRIPTION_MAX_LENGTH} characters.`;
const ESTIMATE_FAILED = "Estimate unavailable right now. Your text is kept — try again, or add items by search.";
const REPLACING_NOTE = "This replaces the estimate you just logged. Add the photo again if you used one.";

const ESTIMATE_ERRORS: Record<Exclude<EstimateMealResult["kind"], "logged">, string> = {
  meal_missing: "This meal is gone. Nothing was logged.",
  nothing_found: "Couldn't pick out any food — say what was on the plate.",
  photo_unreadable: "That photo format can't be read — use JPEG, PNG or WebP, or leave the photo out.",
  unavailable: ESTIMATE_FAILED,
};

interface LazyDescribeStepProps {
  mealId: string;
  description: string;
  replacing: boolean;
  dispatch: (action: PathAction) => void;
}

const mealPageAfterEstimate = (mealId: string, description: string): string =>
  `/meals/${mealId}?${new URLSearchParams({ [ESTIMATE_PARAM]: description })}`;

// Consent gates the request, not the photo: the description goes to Gemini
// too, so a text-only estimate asks first as well. A success already wrote
// the meal, so it leaves for the meal page even if the user backed out to
// options mid-request: that page is where the logged guess can be undone.
const useEstimate = (mealId: string, replacing: boolean) => {
  const router = useRouter();
  const [isEstimating, setIsEstimating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [consentOpen, setConsentOpen] = useState(false);

  const run = async (description: string, photo: File | null) => {
    setError(null);
    setIsEstimating(true);
    try {
      const result = await estimateMeal(mealId, description, photo, replacing);
      if (result.kind === "logged") {
        router.push(mealPageAfterEstimate(mealId, description));
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
// step, so no second heading repeats it here.
export const LazyDescribeStep = ({ mealId, description: initialDescription, replacing, dispatch }: LazyDescribeStepProps) => {
  const [description, setDescription] = useState(initialDescription);
  const [photo, setPhoto] = useState<File | null>(null);
  const [photoKey, setPhotoKey] = useState(0);
  const estimate = useEstimate(mealId, replacing);
  const tooLong = isDescriptionTooLong(description);

  return (
    <div className="flex flex-col gap-4">
      <InlineMessage tone="info">{replacing ? REPLACING_NOTE : DISCLAIMER}</InlineMessage>
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
