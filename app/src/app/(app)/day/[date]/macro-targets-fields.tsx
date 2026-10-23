"use client";

import { PlusIcon } from "@phosphor-icons/react";
import { useId, useState } from "react";

import {
  convertTargetsDraft,
  EMPTY_TARGETS_DRAFT,
  MACRO_KEYS,
  pctToGrams,
  readTargetsDraft,
  targetsToDraft,
  WHOLE_PCT,
  type MacroKey,
  type MacroTargets,
  type MacroTargetsDraft,
  type MacroTargetUnit,
  type TargetsReading,
} from "@/features/goals/actions/macro-targets.utils";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";

interface MacroFieldSpec {
  label: string;
  accentClass: string;
}

// Protein, carbs, fat: the order DayMacros prints them in, so the picker and
// the day view read as one scale.
const MACRO_FIELDS: Record<MacroKey, MacroFieldSpec> = {
  protein: { label: "Protein", accentClass: "bg-accent-protein" },
  carbs: { label: "Carbs", accentClass: "bg-accent-carbs" },
  fat: { label: "Fat", accentClass: "bg-accent-fat" },
};

const UNIT_SUFFIX: Record<MacroTargetUnit, string> = { pct: "%", g: "g" };

const UNIT_CAPTION: Record<MacroTargetUnit, string> = {
  pct: "Share of your daily calories. Leave one blank to not track it.",
  g: "Grams a day. Leave one blank to not track it.",
};

const UNREADABLE_MESSAGE: Record<MacroTargetUnit, string> = {
  pct: "Use whole numbers from 0 to 100.",
  g: "Use whole numbers of grams.",
};

export interface MacroTargetsDraftState {
  draft: MacroTargetsDraft;
  unit: MacroTargetUnit;
  reading: TargetsReading;
  isShown: boolean;
  wasBlocked: boolean;
  show: () => void;
  type: (key: MacroKey, text: string) => void;
  clear: () => void;
  block: () => void;
  convertTo: (unit: MacroTargetUnit, calorieGoal: number) => void;
}

// Shown from the start only when targets are already saved: with none, the
// section waits behind a link so the sheet names no target of its own.
export const useMacroTargetsDraft = (initialTargets: MacroTargets | null, initialUnit: MacroTargetUnit): MacroTargetsDraftState => {
  const [draft, setDraft] = useState(targetsToDraft(initialTargets));
  const [unit, setUnit] = useState(initialUnit);
  const [isShown, setIsShown] = useState(initialTargets !== null);
  const [wasBlocked, setWasBlocked] = useState(false);

  const type = (key: MacroKey, text: string): void => {
    setDraft((current) => ({ ...current, [key]: text }));
    setWasBlocked(false);
  };

  // Clearing folds the section away again: three empty boxes left open would
  // read as targets still to fill, and Save stores none either way.
  const clear = (): void => {
    setDraft(EMPTY_TARGETS_DRAFT);
    setIsShown(false);
    setWasBlocked(false);
  };

  const convertTo = (next: MacroTargetUnit, calorieGoal: number): void => {
    if (next === unit) return;
    setDraft((current) => convertTargetsDraft(current, calorieGoal, next));
    setUnit(next);
    setWasBlocked(false);
  };

  return {
    draft,
    unit,
    reading: readTargetsDraft(draft, unit),
    isShown,
    wasBlocked,
    show: () => setIsShown(true),
    type,
    clear,
    block: () => setWasBlocked(true),
    convertTo,
  };
};

const listNames = (keys: MacroKey[]): string => {
  const names = keys.map((key) => MACRO_FIELDS[key].label.toLowerCase());
  return names.length > 1 ? `${names.slice(0, -1).join(", ")} and ${names.at(-1)}` : names.join("");
};

const untrackedKeys = (targets: MacroTargets): MacroKey[] => MACRO_KEYS.filter((key) => targets.values[key] === null);

const offMessage = (totalPct: number): string => {
  const gap = Math.abs(WHOLE_PCT - totalPct);
  return `Adds up to ${totalPct}%, ${gap}% ${totalPct < WHOLE_PCT ? "short" : "over"}`;
};

// Only shares have a whole to add up to; grams carry no total line.
const readyMessage = (targets: MacroTargets): string | null => {
  if (targets.unit === "g") return null;
  const untracked = untrackedKeys(targets);
  if (untracked.length === 0) return `Adds up to ${WHOLE_PCT}%`;
  const tracked = MACRO_KEYS.reduce((total, key) => total + (targets.values[key] ?? 0), 0);
  return `${WHOLE_PCT - tracked}% left for ${listNames(untracked)}`;
};

const totalMessage = (reading: TargetsReading, unit: MacroTargetUnit): { text: string; isOff: boolean } | null => {
  switch (reading.kind) {
    case "empty":
      return null;
    case "unreadable":
      return { text: UNREADABLE_MESSAGE[unit], isOff: true };
    case "off":
      return { text: offMessage(reading.totalPct), isOff: true };
    case "ready": {
      const text = readyMessage(reading.targets);
      return text === null ? null : { text, isOff: false };
    }
    default: {
      const _exhaustive: never = reading;
      return _exhaustive;
    }
  }
};

const readingTargets = (reading: TargetsReading): MacroTargets | null =>
  reading.kind === "ready" || reading.kind === "off" ? reading.targets : null;

// "Not tracked" under a blank field says the blank is a choice, not a gap.
// A share gets its grams, which answer "what does 30% mean" before the sum
// is settled.
const fieldCaption = (key: MacroKey, targets: MacroTargets | null, draftText: string, calorieGoal: number | null): string | undefined => {
  if (draftText.trim() === "") return "Not tracked";
  const figure = targets?.values[key] ?? null;
  if (targets?.unit !== "pct" || figure === null || calorieGoal === null) return undefined;
  return `${pctToGrams(figure, calorieGoal, key)}g a day`;
};

const sumShares = (shares: number[]): number => shares.reduce((total, share) => total + share, 0);

// Absolute shares, not flex: shares under 100 leave bare track at the end - the
// part left untracked, or the shortfall - and past 100 run off the clipped edge.
// Each segment spans the full track, scaled to its share and shifted past the
// ones before it, so a change animates on the compositor instead of re-laying out.
const SharePreviewBar = ({ targets }: { targets: MacroTargets | null }) => {
  const shares = MACRO_KEYS.map((key) => targets?.values[key] ?? 0);
  return (
    <div className="relative h-2 w-full overflow-hidden rounded-full bg-border" role="presentation">
      {MACRO_KEYS.map((key, index) => (
        <div
          key={key}
          className={`absolute inset-0 origin-left motion-safe:transition-transform motion-safe:duration-200 ${MACRO_FIELDS[key].accentClass}`}
          style={{ transform: `translateX(${sumShares(shares.slice(0, index))}%) scaleX(${shares[index] / WHOLE_PCT})` }}
        />
      ))}
    </div>
  );
};

const TargetsTotal = ({ reading, unit }: { reading: TargetsReading; unit: MacroTargetUnit }) => {
  const message = totalMessage(reading, unit);
  return (
    <p aria-live="polite" className={`min-h-5 text-sm tabular-nums ${message?.isOff ? "text-flag" : "text-text-muted"}`}>
      {message?.text}
    </p>
  );
};

// The swatch is the accent cue, the word beside it the redundant one. The label
// itself stays text-muted: accent ink at text-xs does not clear 4.5:1.
const MacroLabel = ({ macro }: { macro: MacroKey }) => (
  <span className="inline-flex items-center gap-1.5">
    <span aria-hidden className={`size-2 rounded-full ${MACRO_FIELDS[macro].accentClass}`} />
    {MACRO_FIELDS[macro].label}
  </span>
);

const UnitSuffix = ({ unit }: { unit: MacroTargetUnit }) => (
  <span aria-hidden className="pointer-events-none pr-3 text-sm text-text-muted">
    {UNIT_SUFFIX[unit]}
  </span>
);

interface MacroTargetsFieldsProps {
  targetsDraft: MacroTargetsDraftState;
  calorieGoal: number | null;
}

const TargetsFieldGroup = ({ targetsDraft, calorieGoal }: MacroTargetsFieldsProps) => {
  const headingId = useId();
  const { unit, draft, reading } = targetsDraft;
  const targets = readingTargets(reading);

  return (
    <div role="group" aria-labelledby={headingId} className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between gap-3">
        <div className="flex flex-col gap-0.5">
          <h3 id={headingId} className="text-sm font-semibold text-text">
            Macro targets
          </h3>
          <p className="text-sm text-text-muted">{UNIT_CAPTION[unit]}</p>
        </div>
        <Button variant="ghost" link onClick={targetsDraft.clear}>
          Clear
        </Button>
      </div>
      <div className="grid grid-cols-3 gap-3">
        {MACRO_KEYS.map((key) => (
          <Field
            key={key}
            name={`macro-${key}`}
            label={<MacroLabel macro={key} />}
            inputMode="numeric"
            value={draft[key]}
            onChange={(event) => targetsDraft.type(key, event.target.value)}
            helperText={fieldCaption(key, targets, draft[key], calorieGoal)}
            trailing={<UnitSuffix unit={unit} />}
            trailingReserveClass="pr-7"
          />
        ))}
      </div>
      {unit === "pct" && <SharePreviewBar targets={targets} />}
      <TargetsTotal reading={reading} unit={unit} />
    </div>
  );
};

// Dashed with a plus, where the estimate row below is solid with a caret: an
// empty slot that opens here, not a second way out of the sheet. The three
// names answer "what are macros" before the tap; the swatches match the day
// view's columns. Raw button: a list-row shape Button's recipe does not cover.
const AddTargetsRow = ({ onAdd }: { onAdd: () => void }) => (
  <button
    type="button"
    onClick={onAdd}
    className="group flex w-full items-center gap-3 rounded-control border border-dashed border-border p-4 text-left transition-colors hover:border-text-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-text"
  >
    <span
      aria-hidden
      className="flex size-8 shrink-0 items-center justify-center rounded-full bg-surface-raised text-text-muted transition-colors group-hover:bg-border group-hover:text-text"
    >
      <PlusIcon weight="bold" className="size-4" />
    </span>
    <span className="flex flex-col gap-1">
      <span className="text-sm font-semibold text-text">Add macro targets</span>
      <span className="flex flex-wrap gap-x-3 gap-y-1 text-sm text-text-muted">
        {MACRO_KEYS.map((key) => (
          <MacroLabel key={key} macro={key} />
        ))}
      </span>
    </span>
  </button>
);

export const MacroTargetsFields = ({ targetsDraft, calorieGoal }: MacroTargetsFieldsProps) =>
  targetsDraft.isShown ? (
    <TargetsFieldGroup targetsDraft={targetsDraft} calorieGoal={calorieGoal} />
  ) : (
    <AddTargetsRow onAdd={targetsDraft.show} />
  );
