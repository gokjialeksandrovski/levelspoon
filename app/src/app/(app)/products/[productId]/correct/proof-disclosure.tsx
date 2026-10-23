"use client";

import { BarcodeIcon } from "@phosphor-icons/react";
import { useState } from "react";

import { DEMO_SCAN_LIMIT_MESSAGE } from "@/features/demo/demo.messages";
import { linkBarcode, lookupBarcode } from "@/features/products/actions/barcode";
import type { LookupBarcodeResult } from "@/features/products/actions/barcode";
import { ocrNutritionTable } from "@/features/products/actions/ocr";
import type { NutritionRead } from "@/features/products/actions/ocr";
import { attachLabelProof } from "@/features/products/actions/products";
import type { ProductForCorrection } from "@/features/products/actions/products";
import { readBarcodeFromPhoto } from "@/lib/barcode/read-photo";
import { Button } from "@/components/ui/button";
import { Disclosure } from "@/components/ui/disclosure";
import { InlineMessage } from "@/components/ui/inline-message";
import { PhotoInput } from "@/components/ui/photo-input";
import { changedNutritionFields, toFieldValues, toNutritionValues } from "@/lib/ocr/nutrition-fields";
import type { FieldValues, NutritionFieldChange } from "@/lib/ocr/nutrition-fields";

import { photoReuseError } from "../../../meals/[mealId]/capture/steps/nutrition-photo-step";
import { ChangeRow } from "./figure-changes";

/**
 * Which proof this product can still be given.
 *
 * A label photo is offered only while the row has neither proof: once a photo
 * or a barcode vouches for it, other users already hold these figures, and a
 * second proof would overwrite what they were shown. A barcode is offered
 * whenever there is none - it adds a way to find the product without
 * rewriting anything about it.
 */
export interface ProofOptions {
  label: boolean;
  barcode: boolean;
}

export type ProofSubject = Pick<ProductForCorrection, "nutritionPhotoKey" | "hasBarcode">;

export const proofOptions = ({ nutritionPhotoKey, hasBarcode }: ProofSubject): ProofOptions => ({
  label: nutritionPhotoKey === null && !hasBarcode,
  barcode: !hasBarcode,
});

export const hasProofToOffer = (subject: ProofSubject): boolean => {
  const options = proofOptions(subject);
  return options.label || options.barcode;
};

const DISCLOSURE_LABEL = "Help others find this product";
const PRIVATE_INTRO =
  "Only you can see this product. A label photo or a barcode makes it findable for everyone.";
const SHARED_INTRO = "A barcode is how the next person finds this product without typing its name.";

const LABEL_INPUT_LABEL = "Photograph the label";
const LABEL_HINT = "We read the table and check it against your figures first.";
const BARCODE_INPUT_LABEL = "Scan the barcode";
const BARCODE_HINT = "Photograph the code to help everyone else find this product easier.";

const READING_LABEL_STATUS = "Reading the label…";
const READING_BARCODE_STATUS = "Reading the barcode…";

const PER_SERVING_ERROR = "That label lists values per serving, not per 100 g. We can't check it here.";
const UNREADABLE_ERROR = "Couldn't read every figure off that label. Try a straighter, closer shot of the table.";
const OCR_ERROR = "Couldn't read that photo. Please try again.";
const PROOF_TAKEN_ERROR = "Something else already vouches for this product. Reload the screen.";
const ATTACH_ERROR = "Could not attach that photo. Please try again.";
const FLAGGED_READ_NOTE =
  "Some of what we read doesn't add up, so we won't put it on the shared product. The photo can still go on it beside your own figures.";
const REJECTED_BARCODE_ERROR = "That's not a product barcode. Try the striped code on the packaging.";
const BARCODE_LOOKUP_ERROR = "Could not look up this barcode. Please try again.";
const barcodeTakenError = (name: string): string => `This barcode already belongs to ${name}.`;

const LABEL_ATTACHED_MESSAGE = "Label photo attached. Everyone can find this product now.";
const BARCODE_ATTACHED_MESSAGE = "Barcode attached. Everyone can find this product now.";
const VALUES_ADOPTED_MESSAGE =
  "Barcode attached. The listed values are in the form below - check them, then save the correction.";

interface ProofSectionCallbacks {
  /** Puts figures the user accepted into the correction form. They are saved
   * by the form's own Save, not here: a barcode is a shared fact, the figures
   * beside it stay this user's correction. */
  onAdoptValues: (values: FieldValues) => void;
  /** The row's proof changed, so the page has to re-read it - and the message
   * is shown by the parent, which outlives this disclosure's own gating. */
  onAttached: (message: string) => void;
}

type FigureReview =
  | { kind: "error"; message: string }
  | { kind: "matches"; values: FieldValues }
  | { kind: "differs"; values: FieldValues; changes: NutritionFieldChange[]; flagged: boolean };

// fibreG is exempt: a label that prints no fibre row is a complete read, not a
// half-read one, so a blank there must not turn the photo away.
const hasEveryFigure = (values: FieldValues): boolean =>
  (Object.entries(values) as [keyof FieldValues, string][]).every(
    ([field, value]) => field === "fibreG" || value !== "",
  );

// Exported for its own test: this is where a photo that OCR only half-read is
// turned away, before its blanks can be saved as zeroes onto the shared row.
export const reviewLabelRead = (read: NutritionRead, current: FieldValues): FigureReview => {
  switch (read.kind) {
    case "photo-already-used":
      return { kind: "error", message: photoReuseError(read.ownerName) };
    case "demo-limit":
      return { kind: "error", message: DEMO_SCAN_LIMIT_MESSAGE };
    case "needs-serving-size":
      return { kind: "error", message: PER_SERVING_ERROR };
    case "per100g": {
      const values = toFieldValues(read.values);
      if (!hasEveryFigure(values)) {
        return { kind: "error", message: UNREADABLE_ERROR };
      }
      const changes = changedNutritionFields(current, values);
      // A read the validator flags is never offered as a replacement: the
      // confirm step refuses to write figures like these into the shared
      // table, and promoting a row must not be the way around that. The photo
      // can still vouch for the product, carrying the user's own figures.
      return changes.length === 0
        ? { kind: "matches", values }
        : { kind: "differs", values, changes, flagged: read.flags.length > 0 };
    }
  }
};

interface LabelReviewState {
  photo: File;
  values: FieldValues;
  changes: NutritionFieldChange[];
  flagged: boolean;
}

interface UseLabelProofResult {
  busy: string | null;
  error: string | null;
  review: LabelReviewState | null;
  handlePhoto: (photo: File) => void;
  accept: (fromLabel: boolean) => void;
}

interface AttachArgs {
  productId: string;
  photo: File;
  values: FieldValues;
  fromLabel: boolean;
}

const attachProof = async (
  { productId, photo, values, fromLabel }: AttachArgs,
  onAttached: (message: string) => void,
  setError: (message: string) => void,
): Promise<void> => {
  const result = await attachLabelProof(productId, photo, {
    nutritionPer100g: toNutritionValues(values),
    fromLabel,
  });
  switch (result.kind) {
    case "attached":
      onAttached(LABEL_ATTACHED_MESSAGE);
      return;
    case "photo_already_used":
      setError(photoReuseError(result.ownerName));
      return;
    case "not_attachable":
      setError(PROOF_TAKEN_ERROR);
  }
};

const useLabelProof = (
  product: ProductForCorrection,
  values: FieldValues,
  callbacks: ProofSectionCallbacks,
): UseLabelProofResult => {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [review, setReview] = useState<LabelReviewState | null>(null);

  const readPhoto = async (photo: File): Promise<void> => {
    setError(null);
    setReview(null);
    setBusy(READING_LABEL_STATUS);
    try {
      const outcome = reviewLabelRead(await ocrNutritionTable(photo, product.name), values);
      if (outcome.kind === "error") {
        setError(outcome.message);
        return;
      }
      if (outcome.kind === "differs") {
        setReview({ photo, values: outcome.values, changes: outcome.changes, flagged: outcome.flagged });
        return;
      }
      await attachProof(
        { productId: product.id, photo, values: outcome.values, fromLabel: true },
        callbacks.onAttached,
        setError,
      );
    } catch (readError) {
      console.error("Reading a label for proof failed", readError);
      setError(OCR_ERROR);
    } finally {
      setBusy(null);
    }
  };

  const accept = (fromLabel: boolean): void => {
    if (!review) {
      return;
    }
    const chosen = fromLabel ? review.values : values;
    // The form has to move with the row: these figures are what the shared
    // product now holds, and a form still showing the old ones would offer,
    // in its own save preview, to put them straight back.
    if (fromLabel) {
      callbacks.onAdoptValues(chosen);
    }
    setBusy(READING_LABEL_STATUS);
    void attachProof(
      { productId: product.id, photo: review.photo, values: chosen, fromLabel },
      callbacks.onAttached,
      setError,
    )
      .catch((attachError) => {
        console.error("Attaching label proof failed", attachError);
        setError(ATTACH_ERROR);
      })
      .finally(() => setBusy(null));
  };

  return { busy, error, review, handlePhoto: (photo) => void readPhoto(photo), accept };
};

interface AcceptAction {
  label: string;
  onAccept: () => void;
}

interface FigureReviewPanelProps {
  title: string;
  /** Why the read figures are shown but not offered, when they are not. */
  note?: string;
  changes: NutritionFieldChange[];
  /** Null leaves the listed figures as information only, and keeping the
   * user's own becomes the panel's single action. */
  accept: AcceptAction | null;
  keepLabel: string;
  pending: boolean;
  onKeep: () => void;
}

// Same surface and struck-through rows as the Save preview above it, so the
// two "here is what changes" moments on this screen read as one idea.
const FigureReviewPanel = ({
  title, note, changes, accept, keepLabel, pending, onKeep,
}: FigureReviewPanelProps) => (
  <div className="flex flex-col gap-3 rounded-surface bg-surface-raised p-4">
    <p className="text-xs font-medium text-text-muted">{title}</p>
    <ul className="flex flex-col gap-1 text-sm">
      {changes.map((change) => (
        <ChangeRow key={change.field} label={change.label} from={change.from} to={change.to} />
      ))}
    </ul>
    {note && <p className="text-sm/relaxed text-text-muted">{note}</p>}
    <div className="flex flex-col gap-2">
      {accept ? (
        <>
          <Button pending={pending} onClick={accept.onAccept}>
            {accept.label}
          </Button>
          <Button variant="ghost" link onClick={onKeep}>
            {keepLabel}
          </Button>
        </>
      ) : (
        <Button pending={pending} onClick={onKeep}>
          {keepLabel}
        </Button>
      )}
    </div>
  </div>
);

const LabelProofSection = ({
  product, values, callbacks,
}: { product: ProductForCorrection; values: FieldValues; callbacks: ProofSectionCallbacks }) => {
  const label = useLabelProof(product, values, callbacks);

  return (
    <div className="flex flex-col gap-2">
      {label.review ? (
        <FigureReviewPanel
          title="The label reads differently"
          note={label.review.flagged ? FLAGGED_READ_NOTE : undefined}
          changes={label.review.changes}
          accept={label.review.flagged ? null : { label: "Use the label's values", onAccept: () => label.accept(true) }}
          keepLabel={label.review.flagged ? "Attach the photo, keep my figures" : "Keep my figures"}
          pending={label.busy !== null}
          onKeep={() => label.accept(false)}
        />
      ) : (
        <PhotoInput
          label={LABEL_INPUT_LABEL}
          hint={LABEL_HINT}
          onSelect={label.handlePhoto}
          scanningLabel={label.busy ?? undefined}
        />
      )}
      {label.error && <InlineMessage tone="error">{label.error}</InlineMessage>}
    </div>
  );
};

interface BarcodeReviewState {
  barcode: string;
  name: string;
  values: FieldValues;
  changes: NutritionFieldChange[];
}

interface UseBarcodeProofResult {
  busy: string | null;
  error: string | null;
  review: BarcodeReviewState | null;
  handlePhoto: (photo: File) => void;
  accept: (useListed: boolean) => void;
}

interface BarcodeLookupOutcome {
  error?: string;
  link?: string;
  review?: BarcodeReviewState;
}

// The listing is only comparable when it is measured the same way: Open Food
// Facts serves per-100-ml drinks under the same shape as per-100-g solids, and
// lining those two up would invent a conversion nobody made.
const comparableFigures = (
  match: Extract<LookupBarcodeResult, { kind: "external_match" }>,
  product: ProductForCorrection,
  current: FieldValues,
): BarcodeReviewState | null => {
  if (match.nutritionBasisUnit !== product.nutritionBasisUnit) {
    return null;
  }
  const values = toFieldValues(match.nutritionPer100g);
  const changes = changedNutritionFields(current, values);
  return changes.length === 0 ? null : { barcode: match.barcode, name: match.nameGuess, values, changes };
};

// Exported for its own test: this is the decision the user asked for - an
// already-known code is refused, an Open Food Facts listing is offered for
// comparison, and a code nobody has ever seen is simply attached.
export const decideBarcodeOutcome = (
  result: LookupBarcodeResult,
  product: ProductForCorrection,
  current: FieldValues,
): BarcodeLookupOutcome => {
  switch (result.kind) {
    case "rejected":
      return { error: REJECTED_BARCODE_ERROR };
    case "internal_match":
      return { error: barcodeTakenError(result.product.name) };
    case "not_found":
      return { link: result.barcode };
    case "external_match": {
      const review = comparableFigures(result, product, current);
      return review ? { review } : { link: result.barcode };
    }
  }
};

const useBarcodeProof = (
  product: ProductForCorrection,
  values: FieldValues,
  callbacks: ProofSectionCallbacks,
): UseBarcodeProofResult => {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [review, setReview] = useState<BarcodeReviewState | null>(null);

  const link = async (barcode: string, message: string): Promise<void> => {
    const result = await linkBarcode(barcode, product.id);
    if (result.kind === "already_linked_elsewhere") {
      setError(barcodeTakenError(result.product.name));
      return;
    }
    callbacks.onAttached(message);
  };

  const readPhoto = async (photo: File): Promise<void> => {
    setError(null);
    setReview(null);
    setBusy(READING_BARCODE_STATUS);
    try {
      const code = await readBarcodeFromPhoto(photo, setError);
      if (code === null) {
        return;
      }
      const outcome = decideBarcodeOutcome(await lookupBarcode(code), product, values);
      if (outcome.error) {
        setError(outcome.error);
      } else if (outcome.review) {
        setReview(outcome.review);
      } else if (outcome.link) {
        await link(outcome.link, BARCODE_ATTACHED_MESSAGE);
      }
    } catch (lookupError) {
      console.error("Attaching a barcode failed", lookupError);
      setError(BARCODE_LOOKUP_ERROR);
    } finally {
      setBusy(null);
    }
  };

  const accept = (useListed: boolean): void => {
    if (!review) {
      return;
    }
    if (useListed) {
      callbacks.onAdoptValues(review.values);
    }
    setBusy(READING_BARCODE_STATUS);
    void link(review.barcode, useListed ? VALUES_ADOPTED_MESSAGE : BARCODE_ATTACHED_MESSAGE)
      .catch((linkError) => {
        console.error("Linking a barcode failed", linkError);
        setError(BARCODE_LOOKUP_ERROR);
      })
      .finally(() => setBusy(null));
  };

  return { busy, error, review, handlePhoto: (photo) => void readPhoto(photo), accept };
};

const BarcodeProofSection = ({
  product, values, callbacks,
}: { product: ProductForCorrection; values: FieldValues; callbacks: ProofSectionCallbacks }) => {
  const barcode = useBarcodeProof(product, values, callbacks);

  return (
    <div className="flex flex-col gap-2">
      {barcode.review ? (
        <FigureReviewPanel
          title={`Open Food Facts lists this code as ${barcode.review.name}`}
          changes={barcode.review.changes}
          accept={{ label: "Use the listed values", onAccept: () => barcode.accept(true) }}
          keepLabel="Keep my figures"
          pending={barcode.busy !== null}
          onKeep={() => barcode.accept(false)}
        />
      ) : (
        <PhotoInput
          label={BARCODE_INPUT_LABEL}
          hint={BARCODE_HINT}
          icon={BarcodeIcon}
          onSelect={barcode.handlePhoto}
          scanningLabel={barcode.busy ?? undefined}
        />
      )}
      {barcode.error && <InlineMessage tone="error">{barcode.error}</InlineMessage>}
    </div>
  );
};

interface ProofDisclosureProps {
  product: ProductForCorrection;
  values: FieldValues;
  callbacks: ProofSectionCallbacks;
}

export const ProofDisclosure = ({ product, values, callbacks }: ProofDisclosureProps) => {
  const options = proofOptions(product);
  if (!options.label && !options.barcode) {
    return null;
  }

  return (
    <Disclosure label={DISCLOSURE_LABEL}>
      <div className="flex flex-col gap-4 pt-2">
        <p className="text-sm/relaxed text-text-muted">{options.label ? PRIVATE_INTRO : SHARED_INTRO}</p>
        {options.label && <LabelProofSection product={product} values={values} callbacks={callbacks} />}
        {options.barcode && <BarcodeProofSection product={product} values={values} callbacks={callbacks} />}
      </div>
    </Disclosure>
  );
};
