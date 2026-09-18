"use client";

import { useState } from "react";

import { clearPortionGrams, setPortionGrams } from "@/features/products/actions/portions";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { InlineMessage } from "@/components/ui/inline-message";
import { Sheet } from "@/components/ui/sheet";
import type { Portion } from "@/lib/measures/portions";

const SAVE_ERROR = "Could not save that weight. Please try again.";

interface PortionEditorProps {
  productId: string;
  portions: readonly Portion[];
  /** Re-reads the product; awaited, so a failed re-read shows in the sheet
   * rather than leaving a stale chip behind a closed one. */
  onSaved: () => void | Promise<void>;
}

interface PortionFieldProps {
  portion: Portion;
  value: string;
  onChange: (value: string) => void;
}

const PortionField = ({ portion, value, onChange }: PortionFieldProps) => (
  <Field
    label={`One ${portion.label} weighs`}
    name={`portion-${portion.label}`}
    type="number"
    inputMode="decimal"
    value={value}
    onChange={(event) => onChange(event.target.value)}
    helperText="grams"
  />
);

const draftFrom = (portions: readonly Portion[]): Record<string, string> =>
  Object.fromEntries(portions.map((portion) => [portion.label, String(portion.grams)]));

// Only what actually moved is written, so opening the sheet and closing it
// never files an override that just restates the standard.
const changedPortions = (portions: readonly Portion[], draft: Record<string, string>): Portion[] =>
  portions.filter((portion) => Number(draft[portion.label]) !== portion.grams);

interface UsePortionEditorResult {
  draft: Record<string, string>;
  error: string | null;
  isBusy: boolean;
  reset: () => void;
  setValue: (label: string, value: string) => void;
  save: () => Promise<void>;
  revert: () => Promise<void>;
}

const usePortionEditor = (
  productId: string,
  portions: readonly Portion[],
  onSaved: () => void | Promise<void>,
): UsePortionEditorResult => {
  const [draft, setDraft] = useState(() => draftFrom(portions));
  const [error, setError] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);

  const run = async (work: () => Promise<void>) => {
    setError(null);
    setIsBusy(true);
    try {
      await work();
      await onSaved();
    } catch (caught) {
      console.error("Saving a portion weight failed", caught);
      setError(SAVE_ERROR);
    } finally {
      setIsBusy(false);
    }
  };

  return {
    draft,
    error,
    isBusy,
    // The component outlives a save, so a reopened sheet would otherwise show
    // the figures from before the one that just landed.
    reset: () => {
      setDraft(draftFrom(portions));
      setError(null);
    },
    setValue: (label, value) => setDraft((current) => ({ ...current, [label]: value })),
    save: () =>
      run(async () => {
        for (const portion of changedPortions(portions, draft)) {
          await setPortionGrams(productId, portion.label, Number(draft[portion.label]));
        }
      }),
    revert: () =>
      run(async () => {
        for (const portion of portions) {
          await clearPortionGrams(productId, portion.label);
        }
      }),
  };
};

/**
 * Per-product portion weights, opened from the chip row.
 *
 * A standard slice is 28 g and a real one runs 20-45 g, so the figure on a
 * chip is a starting point, not a measurement. This is where a user replaces
 * it with what their own bread weighs - for this product, for themselves.
 */
export const PortionEditor = ({ productId, portions, onSaved }: PortionEditorProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const editor = usePortionEditor(productId, portions, async () => {
    await onSaved();
    setIsOpen(false);
  });
  const open = () => {
    editor.reset();
    setIsOpen(true);
  };

  return (
    <>
      <Button variant="ghost" link onClick={open}>
        Edit portion sizes
      </Button>
      <Sheet
        open={isOpen}
        onClose={() => setIsOpen(false)}
        title="Portion sizes"
        footer={
          <div className="flex flex-col gap-2">
            {editor.error && <InlineMessage tone="error">{editor.error}</InlineMessage>}
            <Button pending={editor.isBusy} onClick={editor.save}>
              Save
            </Button>
            <Button variant="ghost" disabled={editor.isBusy} onClick={editor.revert}>
              Use the standard sizes
            </Button>
          </div>
        }
      >
        <div className="flex flex-col gap-4">
          <p className="text-sm text-text-muted">
            Applies to this product, for you only. Meals you already logged keep the
            weight they were logged at.
          </p>
          {portions.map((portion) => (
            <PortionField
              key={portion.label}
              portion={portion}
              value={editor.draft[portion.label] ?? ""}
              onChange={(value) => editor.setValue(portion.label, value)}
            />
          ))}
        </div>
      </Sheet>
    </>
  );
};
