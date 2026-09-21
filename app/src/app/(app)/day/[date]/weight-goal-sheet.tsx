// app/src/app/(app)/day/[date]/weight-goal-sheet.tsx
"use client";

import { useState } from "react";

import { saveWeightGoal } from "@/features/weight/actions/weight";
import {
  CHECKIN_PRESETS,
  bandPresets,
  commitWeightDraft,
  defaultBand,
  defaultPace,
  DEFAULT_CHECKIN_INTERVAL_DAYS,
  displayWeight,
  draftToRangedKg,
  isUnusableWeightDraft,
  pacePresets,
  parseDecimalDraft,
  weightGoalInputError,
  type InvalidGoalReason,
  type WeightGoalInput,
  type WeightGoalMode,
  type WeightUnit,
  type WeightView,
} from "@/features/weight/actions/weight.utils";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { InlineMessage } from "@/components/ui/inline-message";
import { Sheet } from "@/components/ui/sheet";
import { FOCUS_RING } from "@/components/ui/tap-target";
import { todayLocalDateString } from "@/lib/date/day-bounds";

import { projectionLineText } from "./weight-row.utils";

// A draft nobody can store yet: every field holds text while it is being
// typed, in the unit on screen, and only draftToInput turns it into kg.
export interface GoalDraft {
  mode: WeightGoalMode;
  unit: WeightUnit;
  currentDraft: string;
  targetDraft: string;
  paceDraft: string;
  bandDraft: string;
  cadenceDraft: string;
}

const DAILY_DAYS = 1;
const WEEKLY_DAYS = 7;
const FORTNIGHTLY_DAYS = 14;

const CADENCE_LABELS: Record<number, string> = {
  [DAILY_DAYS]: "Daily",
  [WEEKLY_DAYS]: "Weekly",
  [FORTNIGHTLY_DAYS]: "2 weeks",
};

export const cadenceLabel = (days: number): string => CADENCE_LABELS[days] ?? "Monthly";

// A rejected draft becomes an input the action refuses by name, rather than a
// guessed number: 0 is not a weight anybody typed.
const REJECTED_WEIGHT = 0;

const weightFromDraft = (draft: string, unit: WeightUnit): number =>
  isUnusableWeightDraft(draft, unit) ? REJECTED_WEIGHT : commitWeightDraft(draft, unit, REJECTED_WEIGHT);

export const draftToInput = (draft: GoalDraft): WeightGoalInput => {
  const shared = {
    unit: draft.unit,
    currentWeightKg: weightFromDraft(draft.currentDraft, draft.unit),
    checkinIntervalDays: parseDecimalDraft(draft.cadenceDraft),
  };

  if (draft.mode === "hold") {
    return {
      ...shared,
      mode: "hold",
      targetWeightKg: null,
      rateKgPerWeek: null,
      holdBandKg: draftToRangedKg(draft.bandDraft, draft.unit),
    };
  }
  return {
    ...shared,
    mode: "target",
    targetWeightKg: weightFromDraft(draft.targetDraft, draft.unit),
    rateKgPerWeek: draftToRangedKg(draft.paceDraft, draft.unit),
    holdBandKg: null,
  };
};

const DEFAULT_UNIT: WeightUnit = "kg";

const emptyDraft = (unit: WeightUnit): GoalDraft => ({
  mode: "target",
  unit,
  currentDraft: "",
  targetDraft: "",
  paceDraft: String(defaultPace(unit)),
  bandDraft: String(defaultBand(unit)),
  cadenceDraft: String(DEFAULT_CHECKIN_INTERVAL_DAYS),
});

const storedWeight = (weightKg: number | null | undefined, unit: WeightUnit): string =>
  weightKg === null || weightKg === undefined ? "" : String(displayWeight(weightKg, unit));

const initialDraft = (view: WeightView | null): GoalDraft => {
  if (view === null) return emptyDraft(DEFAULT_UNIT);
  const { unit } = view;
  return {
    ...emptyDraft(unit),
    mode: view.goal.mode,
    currentDraft: storedWeight(view.latest?.weightKg, unit),
    targetDraft: storedWeight(view.goal.targetWeightKg, unit),
    paceDraft: storedWeight(view.goal.rateKgPerWeek, unit) || String(defaultPace(unit)),
    bandDraft: storedWeight(view.goal.holdBandKg, unit) || String(defaultBand(unit)),
    cadenceDraft: String(view.goal.checkinIntervalDays),
  };
};

// Flipping the unit re-expresses what is already typed rather than clearing
// it: a draft the user cannot get back is a cancel they did not ask for.
// A figure still sitting on a preset moves to the same position in the new
// unit's own round numbers, so 0.5 kg/wk becomes 1 lb/wk and not 1.1.
const convertedPreset = (
  text: string,
  presets: (unit: WeightUnit) => number[],
  from: WeightUnit,
  to: WeightUnit,
): string | null => {
  const index = presets(from).indexOf(parseDecimalDraft(text));
  return index === -1 ? null : String(presets(to)[index]);
};

const convertDraft = (draft: GoalDraft, unit: WeightUnit): GoalDraft => {
  const reexpress = (text: string): string =>
    text.trim() === "" ? text : String(displayWeight(draftToRangedKg(text, draft.unit), unit));

  return {
    ...draft,
    unit,
    currentDraft: reexpress(draft.currentDraft),
    targetDraft: reexpress(draft.targetDraft),
    paceDraft: convertedPreset(draft.paceDraft, pacePresets, draft.unit, unit) ?? reexpress(draft.paceDraft),
    bandDraft: convertedPreset(draft.bandDraft, bandPresets, draft.unit, unit) ?? reexpress(draft.bandDraft),
  };
};

const MODE_OPTIONS: { mode: WeightGoalMode; label: string }[] = [
  { mode: "target", label: "Reach a target" },
  { mode: "hold", label: "Hold steady" },
];

// Two exclusive choices, so both stay visible and the selected one is filled -
// a select would hide the alternative behind a tap.
const ModeChoice = ({ mode, onChange }: { mode: WeightGoalMode; onChange: (mode: WeightGoalMode) => void }) => (
  <div className="flex gap-2">
    {MODE_OPTIONS.map((option) => (
      <Button
        key={option.mode}
        variant={mode === option.mode ? "primary" : "ghost"}
        className="flex-1 px-0"
        aria-pressed={mode === option.mode}
        onClick={() => onChange(option.mode)}
      >
        {option.label}
      </Button>
    ))}
  </div>
);

const UNIT_OPTIONS: WeightUnit[] = ["kg", "lb"];

// Fused into the field's right edge rather than stacked above it: the unit
// belongs to the figure, and a row of its own costs height this sheet does
// not have. Each segment is the field's full height and w-11, so both land on
// the 44px touch floor without the box growing.
// Raw buttons are the documented Rule 16 exception - no Button variant covers
// a segment sitting inside another control's box.
const UnitToggle = ({ unit, onChange }: { unit: WeightUnit; onChange: (unit: WeightUnit) => void }) => (
  <div role="group" aria-label="Weight unit" className="flex h-full items-stretch gap-px overflow-hidden rounded-control">
    {UNIT_OPTIONS.map((option) => (
      <button
        key={option}
        type="button"
        onClick={() => onChange(option)}
        aria-pressed={unit === option}
        className={`flex w-11 items-center justify-center text-sm transition-colors ${FOCUS_RING} ${
          unit === option ? "bg-text font-medium text-bg" : "bg-surface-raised text-text-muted hover:text-text"
        }`}
      >
        {option}
      </button>
    ))}
  </div>
);

// The unit a field is already governed by, printed where its toggle would be.
// aria-hidden: the field's own label and the toggle above already name it.
const UnitSuffix = ({ children }: { children: string }) => (
  <span aria-hidden="true" className="pointer-events-none pr-3 text-sm text-text-muted">
    {children}
  </span>
);

interface PresetFieldProps {
  label: string;
  name: string;
  suffix: string;
  value: string;
  presets: number[];
  presetLabel?: (value: number) => string;
  onChange: (value: string) => void;
}

// One value, one control. The chips are accelerators that write into the
// field - the same relationship AmountChips has with the amount field - so a
// figure nobody put on a chip is still typeable, and the chips still say what
// the common answers are.
const PresetField = ({ label, name, suffix, value, presets, presetLabel, onChange }: PresetFieldProps) => {
  const selected = parseDecimalDraft(value);

  return (
    <div className="flex flex-col gap-2">
      <Field
        label={label}
        name={name}
        inputMode="decimal"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        trailing={<UnitSuffix>{suffix}</UnitSuffix>}
      />
      <div className="flex gap-2">
        {presets.map((preset) => (
          <Button
            key={preset}
            variant={preset === selected ? "primary" : "ghost"}
            className="flex-1 px-0 tabular-nums"
            aria-pressed={preset === selected}
            onClick={() => onChange(String(preset))}
          >
            {presetLabel ? presetLabel(preset) : preset}
          </Button>
        ))}
      </div>
    </div>
  );
};

const REASON_MESSAGE: Record<InvalidGoalReason, string> = {
  weight: "Enter your current weight.",
  target: "Enter a target weight.",
  target_equals_current: "That target is your current weight. Choose Hold steady instead.",
  rate: "Enter a pace above zero.",
  band: "Enter a band above zero.",
  cadence: "Enter how many days between weigh-ins.",
};

interface WeightGoalSheetProps {
  open: boolean;
  view: WeightView | null;
  onClose: () => void;
  onSaved: (view: WeightView) => void;
}

// No effect resyncing the draft on reopen: WeightRow remounts this component
// with a fresh `key` per open, so state starts clean. Cancel is Sheet's own
// Escape/backdrop/✕ and writes nothing. Deleting a goal lives on the row's
// panel, not here - a destructive control has no business inside a form the
// user is reading to edit.
export const WeightGoalSheet = ({ open, view, onClose, onSaved }: WeightGoalSheetProps) => {
  const [draft, setDraft] = useState<GoalDraft>(() => initialDraft(view));
  const [isSaving, setIsSaving] = useState(false);
  const [rejection, setRejection] = useState<string | null>(null);
  const [hasError, setHasError] = useState(false);

  const input = draftToInput(draft);
  const projection =
    draft.mode === "target" && weightGoalInputError(input) === null
      ? projectionLineText(
          {
            mode: "target",
            startWeightKg: input.currentWeightKg,
            startDate: "",
            targetWeightKg: input.targetWeightKg,
            rateKgPerWeek: input.rateKgPerWeek,
            holdBandKg: null,
            checkinIntervalDays: input.checkinIntervalDays,
          },
          input.currentWeightKg,
          todayLocalDateString(Intl.DateTimeFormat().resolvedOptions().timeZone),
          draft.unit,
        )
      : null;

  const submit = (): void => {
    const reason = weightGoalInputError(input);
    if (reason) {
      setRejection(REASON_MESSAGE[reason]);
      return;
    }
    setRejection(null);
    setIsSaving(true);
    setHasError(false);
    saveWeightGoal(input, Intl.DateTimeFormat().resolvedOptions().timeZone)
      .then((result) => {
        if (result.kind === "saved") {
          onSaved(result.view);
          onClose();
        } else {
          setRejection(REASON_MESSAGE[result.reason]);
        }
      })
      .catch(() => setHasError(true))
      .finally(() => setIsSaving(false));
  };

  const footer = (
    <Button variant="primary" className="w-full" pending={isSaving} onClick={submit}>
      Save goal
    </Button>
  );

  return (
    <Sheet open={open} onClose={onClose} title="Weight goal" footer={footer}>
      <div className="flex flex-col gap-5">
        <ModeChoice mode={draft.mode} onChange={(mode) => setDraft({ ...draft, mode })} />
        <div className="flex flex-col gap-3">
          <Field
            label="Current weight"
            name="current-weight"
            inputMode="decimal"
            value={draft.currentDraft}
            onChange={(event) => setDraft({ ...draft, currentDraft: event.target.value })}
            trailing={<UnitToggle unit={draft.unit} onChange={(unit) => setDraft(convertDraft(draft, unit))} />}
            trailingReserveClass="pr-24"
          />
          {draft.mode === "target" && (
            <Field
              label="Target weight"
              name="target-weight"
              inputMode="decimal"
              value={draft.targetDraft}
              onChange={(event) => setDraft({ ...draft, targetDraft: event.target.value })}
              trailing={<UnitSuffix>{draft.unit}</UnitSuffix>}
            />
          )}
        </div>
        {draft.mode === "target" ? (
          <PresetField
            label="Pace"
            name="pace"
            suffix={`${draft.unit}/wk`}
            value={draft.paceDraft}
            presets={pacePresets(draft.unit)}
            onChange={(paceDraft) => setDraft({ ...draft, paceDraft })}
          />
        ) : (
          <PresetField
            label="Band"
            name="hold-band"
            suffix={`± ${draft.unit}`}
            value={draft.bandDraft}
            presets={bandPresets(draft.unit)}
            onChange={(bandDraft) => setDraft({ ...draft, bandDraft })}
          />
        )}
        <PresetField
          label="Weigh in every"
          name="cadence"
          suffix="days"
          value={draft.cadenceDraft}
          presets={[...CHECKIN_PRESETS]}
          presetLabel={cadenceLabel}
          onChange={(cadenceDraft) => setDraft({ ...draft, cadenceDraft })}
        />
        {/* The user's own two numbers, divided. No calorie figure appears here
            or anywhere else in this feature. */}
        {projection && <p className="text-sm text-text-muted">{projection}</p>}
        {rejection && <InlineMessage tone="info">{rejection}</InlineMessage>}
        {hasError && <InlineMessage tone="error">Could not save. Please try again.</InlineMessage>}
      </div>
    </Sheet>
  );
};
