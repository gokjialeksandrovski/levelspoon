"use client";

import { CameraIcon } from "@phosphor-icons/react";
import { useReducedMotion } from "motion/react";
import * as motion from "motion/react-m";
import Image from "next/image";
import { useEffect, useId, useRef, useState } from "react";

import { estimateQuantity, type EstimateQuantityResult } from "@/features/quantity/actions/quantity";
import { Button } from "@/components/ui/button";
import { InlineMessage } from "@/components/ui/inline-message";
import { AttachedPhoto, PhotoSourceTile, takePickedPhoto, useDataUrl } from "@/components/ui/photo-input";
import { ScanSweep } from "@/components/ui/scanning-overlay";
import { Sheet } from "@/components/ui/sheet";
import { contentFadeInitial, contentFadeTransition } from "@/lib/motion/step-transition";

import { hasAcceptedAiPhotoConsent, recordAiPhotoConsent } from "./ai-photo-consent";

// Gray line under the picker: says the figure is an AI guess before the user
// takes the photo. The data-use and third-party detail lives in the terms
// sheet, shown once before first use.
const DISCLAIMER = "AI guesses the grams from your photo. Estimate can be wrong.";

// Verbatim legal copy - do not paraphrase.
const CONSENT_INTRO = "By enabling this AI feature, you acknowledge and agree to the following:";

interface ConsentTerm {
  term: string;
  detail: string;
}

const CONSENT_TERMS: ConsentTerm[] = [
  {
    term: "Privacy & Data Use",
    detail:
      "This feature relies on a public AI tier. Your inputs and generated responses may be processed, logged, and reviewed by human reviewers to train and improve underlying machine learning models. Do not submit sensitive, personal, financial, or confidential information.",
  },
  {
    term: "Accuracy Warning",
    detail:
      "Responses are generated automatically by artificial intelligence and may contain errors or inaccurate information. Always independently verify critical information.",
  },
  {
    term: "Age Requirement",
    detail: "You must be 18 years of age or older to use this AI feature.",
  },
  {
    term: "Acceptable Use",
    detail:
      "You are responsible for the prompts you submit and agree not to use this service for illegal, harmful, or abusive content.",
  },
];

const ConsentTermList = () => (
  <dl className="flex flex-col gap-4">
    {CONSENT_TERMS.map(({ term, detail }) => (
      <div key={term} className="flex flex-col gap-1">
        <dt className="text-sm font-semibold text-text">{term}</dt>
        <dd className="text-sm/relaxed text-text-muted">{detail}</dd>
      </div>
    ))}
  </dl>
);

interface AiConsentSheetProps {
  open: boolean;
  onAgree: () => void;
  onDecline: () => void;
}

const ConsentActions = ({ onAgree, onDecline }: { onAgree: () => void; onDecline: () => void }) => (
  <div className="flex gap-2">
    <Button onClick={onAgree}>I agree</Button>
    <Button variant="ghost" onClick={onDecline}>
      Not now
    </Button>
  </div>
);

export const AiConsentSheet = ({ open, onAgree, onDecline }: AiConsentSheetProps) => (
  <Sheet
    open={open}
    onClose={onDecline}
    title="AI Assistant Privacy & Terms"
    footer={<ConsentActions onAgree={onAgree} onDecline={onDecline} />}
  >
    <div className="flex flex-col gap-5">
      <p className="text-sm text-text-muted">{CONSENT_INTRO}</p>
      <ConsentTermList />
    </div>
  </Sheet>
);

// Chosen file is held and only sent for estimation once the user agrees to
// the terms. "Not now" discards it; the tile cleared its own input on pick.
const useAmountPhotoGate = (onSelect: (photo: File) => void) => {
  const [heldPhoto, setHeldPhoto] = useState<File | null>(null);
  const handleSelect = (photo: File) =>
    hasAcceptedAiPhotoConsent() ? onSelect(photo) : setHeldPhoto(photo);
  const agree = () => {
    recordAiPhotoConsent();
    if (heldPhoto) onSelect(heldPhoto);
    setHeldPhoto(null);
  };
  return { promptOpen: heldPhoto !== null, handleSelect, agree, decline: () => setHeldPhoto(null) };
};

export type AmountPhotoState =
  | { kind: "idle" }
  | { kind: "failed"; message: string }
  | { kind: "estimating"; photo: File }
  | { kind: "estimated"; photo: File; grams: number };

const IDLE: AmountPhotoState = { kind: "idle" };

// Each says whether another photo, a retry later, or neither can help: a
// refused key fails the same way on every photo.
const ESTIMATE_FAILURES: Record<Exclude<EstimateQuantityResult["kind"], "estimated">, string> = {
  no_estimate: "Couldn't judge the amount from that photo. Type the amount, or try another photo.",
  photo_unreadable: "That photo format can't be read. Use JPEG, PNG or WebP, or type the amount.",
  key_missing: "AI estimates aren't set up here. Type the amount.",
  key_rejected: "The AI key was refused. Type the amount.",
  rate_limited: "The AI key has reached its usage limit. Type the amount, or try again later.",
  timed_out: "The estimate took too long. Type the amount, or try again.",
  unavailable: "Couldn't estimate right now. Type the amount, or try again.",
};

// A server action cannot be aborted, so cancelling retires the request
// instead: a reply whose id is no longer current is dropped unread.
export const useAmountEstimate = (foodName: string, onEstimated: (grams: number) => void) => {
  const [state, setState] = useState<AmountPhotoState>(IDLE);
  const currentRequest = useRef(0);

  const start = async (photo: File) => {
    const requestId = ++currentRequest.current;
    setState({ kind: "estimating", photo });
    try {
      const result = await estimateQuantity(photo, foodName);
      if (requestId !== currentRequest.current) return;
      if (result.kind !== "estimated") {
        setState({ kind: "failed", message: ESTIMATE_FAILURES[result.kind] });
        return;
      }
      onEstimated(result.grams);
      setState({ kind: "estimated", photo, grams: result.grams });
    } catch (error) {
      if (requestId !== currentRequest.current) return;
      console.error("Quantity estimation failed", error);
      setState({ kind: "failed", message: ESTIMATE_FAILURES.unavailable });
    }
  };

  const reset = () => {
    currentRequest.current += 1;
    setState(IDLE);
  };

  return { state, start, reset };
};

// The pinned model answers in about 1.4 s (CLAUDE.md, "Gemini model"); six
// times that is a stalled request or a slow network, not a busy model.
const SLOW_ESTIMATE_MS = 8000;

const useIsSlow = (): boolean => {
  const [isSlow, setIsSlow] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setIsSlow(true), SLOW_ESTIMATE_MS);
    return () => clearTimeout(timer);
  }, []);
  return isSlow;
};

// Each state replaces the last in the same slot: a content swap inside the
// step, so the step's quieter fade, not a second slide.
const FadeIn = ({ children, className }: { children: React.ReactNode; className?: string }) => {
  const reduceMotion = useReducedMotion();
  return (
    <motion.div initial={contentFadeInitial(reduceMotion)} animate={{ opacity: 1 }} transition={contentFadeTransition(reduceMotion)} className={className}>
      {children}
    </motion.div>
  );
};

// Cropped to fill, unlike PhotoPreview's letterbox: a plate, not a label to
// read. No veil either, so the sweep crosses the food itself.
const EstimatingFrame = ({ photo }: { photo: File }) => {
  const url = useDataUrl(photo);
  return (
    <div className="relative aspect-4/3 overflow-hidden rounded-surface bg-surface-raised">
      {url && <Image src={url} alt="" fill unoptimized className="object-cover" />}
      <ScanSweep />
    </div>
  );
};

interface AiEstimateProgressProps {
  /** Null when the request carries no photo, e.g. a text-only lazy track. */
  photo: File | null;
  label: string;
  /** What the user can do instead, shown once the wait runs long. */
  slowHint: string;
  onCancel: () => void;
}

// The whole wait in one place: what is being read, that it is being read,
// and a way out that is not "wait it out".
export const AiEstimateProgress = ({ photo, label, slowHint, onCancel }: AiEstimateProgressProps) => {
  const isSlow = useIsSlow();
  return (
    <FadeIn className="flex flex-col gap-3">
      {photo && <EstimatingFrame photo={photo} />}
      <div className="flex min-h-11 items-center justify-between gap-4 pl-1">
        <p role="status" className="flex items-center gap-2.5 text-sm font-medium text-text">
          <span aria-hidden="true" className="size-2 shrink-0 animate-pulse rounded-full bg-text-muted" />
          {label}
        </p>
        <Button variant="ghost" link onClick={onCancel}>
          Cancel
        </Button>
      </div>
      {isSlow && <p className="-mt-2 pl-1 text-sm/relaxed text-text-muted">{slowHint}</p>}
    </FadeIn>
  );
};

const PHOTO_LABEL = "Amount photo (optional)";
const ESTIMATING_LABEL = "Estimating the grams";
const SLOW_HINT = "Taking longer than usual. You can type the amount instead.";

interface AmountPhotoFieldProps {
  state: AmountPhotoState;
  onSelect: (photo: File) => void;
  onReset: () => void;
}

const AmountPhotoPicker = ({ onSelect, failure }: { onSelect: (photo: File) => void; failure: string | null }) => {
  const hintId = useId();
  return (
    <div className="flex flex-col gap-1.5">
      <PhotoSourceTile label={PHOTO_LABEL} icon={CameraIcon} describedBy={hintId} onChange={(event) => takePickedPhoto(event, onSelect)} />
      <p id={hintId} className="text-sm/relaxed text-text-muted">
        {DISCLAIMER}
      </p>
      {failure && <InlineMessage tone="error">{failure}</InlineMessage>}
    </div>
  );
};

const AmountPhotoBody = ({ state, onSelect, onReset }: AmountPhotoFieldProps) => {
  switch (state.kind) {
    case "idle":
      return <AmountPhotoPicker onSelect={onSelect} failure={null} />;
    case "failed":
      return <AmountPhotoPicker onSelect={onSelect} failure={state.message} />;
    case "estimating":
      return <AiEstimateProgress photo={state.photo} label={ESTIMATING_LABEL} slowHint={SLOW_HINT} onCancel={onReset} />;
    case "estimated":
      return (
        <FadeIn>
          <AttachedPhoto photo={state.photo} label="Amount photo" detail={`AI estimate · ${Math.round(state.grams)} g`} onRemove={onReset} />
        </FadeIn>
      );
    default: {
      const unreachable: never = state;
      return unreachable;
    }
  }
};

// Gates the amount photo behind a one-time terms acknowledgement.
export const AmountPhotoField = ({ state, onSelect, onReset }: AmountPhotoFieldProps) => {
  const gate = useAmountPhotoGate(onSelect);
  return (
    <>
      <AmountPhotoBody state={state} onSelect={gate.handleSelect} onReset={onReset} />
      <AiConsentSheet open={gate.promptOpen} onAgree={gate.agree} onDecline={gate.decline} />
    </>
  );
};
