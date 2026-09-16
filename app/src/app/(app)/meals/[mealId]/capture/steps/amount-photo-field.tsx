"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { PhotoInput } from "@/components/ui/photo-input";
import { Sheet } from "@/components/ui/sheet";

import { hasAcceptedAiPhotoConsent, recordAiPhotoConsent } from "./ai-photo-consent";

// Gray line under the picker - just the accuracy note. The data-use and
// third-party detail lives in the terms sheet, shown once before first use.
const DISCLAIMER = "Estimates using this feature may not be accurate.";

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
        <dd className="text-sm/relaxed  text-text-muted">{detail}</dd>
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

const AiConsentSheet = ({ open, onAgree, onDecline }: AiConsentSheetProps) => (
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
// the terms. "Not now" discards it and remounts PhotoInput via resetKey.
const useAmountPhotoGate = (onSelect: (photo: File) => void) => {
  const [heldPhoto, setHeldPhoto] = useState<File | null>(null);
  const [resetKey, setResetKey] = useState(0);
  const handleSelect = (photo: File) =>
    hasAcceptedAiPhotoConsent() ? onSelect(photo) : setHeldPhoto(photo);
  const agree = () => {
    recordAiPhotoConsent();
    if (heldPhoto) onSelect(heldPhoto);
    setHeldPhoto(null);
  };
  const decline = () => {
    setHeldPhoto(null);
    setResetKey((key) => key + 1);
  };
  return { promptOpen: heldPhoto !== null, resetKey, handleSelect, agree, decline };
};

const ESTIMATING_LABEL = "Estimating the amount…";

interface AmountPhotoFieldProps {
  onSelect: (photo: File) => void;
  isEstimating: boolean;
}

// Gates the amount photo behind a one-time terms acknowledgement.
export const AmountPhotoField = ({ onSelect, isEstimating }: AmountPhotoFieldProps) => {
  const gate = useAmountPhotoGate(onSelect);

  return (
    <>
      <PhotoInput
        key={gate.resetKey}
        label="Amount photo (optional)"
        hint={DISCLAIMER}
        onSelect={gate.handleSelect}
        scanningLabel={isEstimating ? ESTIMATING_LABEL : undefined}
      />
      <AiConsentSheet open={gate.promptOpen} onAgree={gate.agree} onDecline={gate.decline} />
    </>
  );
};
