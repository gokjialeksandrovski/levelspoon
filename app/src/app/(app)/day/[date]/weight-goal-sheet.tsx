// app/src/app/(app)/day/[date]/weight-goal-sheet.tsx
"use client";

import { useState } from "react";

import { deleteWeightGoal, saveWeightGoal } from "@/features/weight/actions/weight";
import {
  CHECKIN_INTERVALS,
  DEFAULT_BAND_KG,
  DEFAULT_CHECKIN_INTERVAL_DAYS,
  DEFAULT_PACE_KG_PER_WEEK,
  PACE_CHOICES,
  commitWeightDraft,
  isUnusableWeightDraft,
  weightGoalInputError,
  type InvalidGoalReason,
  type WeightGoalInput,
  type WeightGoalMode,
  type WeightView,
} from "@/features/weight/actions/weight.utils";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { InlineMessage } from "@/components/ui/inline-message";
import { Sheet } from "@/components/ui/sheet";
import { todayLocalDateString } from "@/lib/date/day-bounds";

import { projectionLineText } from "./weight-row.utils";

// A draft nobody can store yet: the fields hold text while they are being
// typed, and only draftToInput turns them into numbers.
export interface GoalDraft {
  mode: WeightGoalMode;
  currentDraft: string;
  targetDraft: string;
  rateKgPerWeek: number;
  bandKg: number;
  checkinIntervalDays: number;
}

const WEEKLY_DAYS = 7;
const FORTNIGHTLY_DAYS = 14;

const CADENCE_LABELS: Record<number, string> = {
  [WEEKLY_DAYS]: "Weekly",
  [FORTNIGHTLY_DAYS]: "2 weeks",
};

export const cadenceLabel = (days: number): string => CADENCE_LABELS[days] ?? "Monthly";

// A rejected draft becomes an input the action refuses by name, rather than a
// guessed number: 0 is not a weight anybody typed.
const REJECTED_WEIGHT = 0;

export const draftToInput = (draft: GoalDraft): WeightGoalInput => {
  const currentWeightKg = isUnusableWeightDraft(draft.currentDraft)
    ? REJECTED_WEIGHT
    : commitWeightDraft(draft.currentDraft, REJECTED_WEIGHT);
  const targetWeightKg = isUnusableWeightDraft(draft.targetDraft)
    ? REJECTED_WEIGHT
    : commitWeightDraft(draft.targetDraft, REJECTED_WEIGHT);

  if (draft.mode === "hold") {
    return {
      mode: "hold",
      currentWeightKg,
      targetWeightKg: null,
      rateKgPerWeek: null,
      holdBandKg: draft.bandKg,
      checkinIntervalDays: draft.checkinIntervalDays,
    };
  }
  return {
    mode: "target",
    currentWeightKg,
    targetWeightKg,
    rateKgPerWeek: draft.rateKgPerWeek,
    holdBandKg: null,
    checkinIntervalDays: draft.checkinIntervalDays,
  };
};

const EMPTY_DRAFT: GoalDraft = {
  mode: "target",
  currentDraft: "",
  targetDraft: "",
  rateKgPerWeek: DEFAULT_PACE_KG_PER_WEEK,
  bandKg: DEFAULT_BAND_KG,
  checkinIntervalDays: DEFAULT_CHECKIN_INTERVAL_DAYS,
};

const storedDraft = (weightKg: number | null | undefined): string =>
  weightKg === null || weightKg === undefined ? "" : String(weightKg);

const initialDraft = (view: WeightView | null): GoalDraft =>
  view === null
    ? EMPTY_DRAFT
    : {
        mode: view.goal.mode,
        currentDraft: storedDraft(view.latest?.weightKg),
        targetDraft: storedDraft(view.goal.targetWeightKg),
        rateKgPerWeek: view.goal.rateKgPerWeek ?? DEFAULT_PACE_KG_PER_WEEK,
        bandKg: view.goal.holdBandKg ?? DEFAULT_BAND_KG,
        checkinIntervalDays: view.goal.checkinIntervalDays,
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

interface ChipRowProps {
  label: string;
  choices: readonly number[];
  selected: number;
  format: (value: number) => string;
  onChange: (value: number) => void;
}

// GoalChips' shape: equal-width ghost buttons, the selected one filled. One
// row, never two - the same rule the amount chips follow.
//
// Not generic over the number union: a `<T extends number>` arrow in a .tsx
// file parses as JSX, and the two call sites below gain nothing from it.
const ChipRow = ({ label, choices, selected, format, onChange }: ChipRowProps) => (
  <div className="flex flex-col gap-2">
    <p className="text-sm text-text-muted">{label}</p>
    <div className="flex gap-2">
      {choices.map((choice) => (
        <Button
          key={choice}
          variant={choice === selected ? "primary" : "ghost"}
          className="flex-1 px-0 tabular-nums"
          aria-pressed={choice === selected}
          onClick={() => onChange(choice)}
        >
          {format(choice)}
        </Button>
      ))}
    </div>
  </div>
);

const REASON_MESSAGE: Record<InvalidGoalReason, string> = {
  weight: "Enter your current weight in kg.",
  target: "Enter a target weight in kg.",
  target_equals_current: "That target is your current weight. Choose Hold steady instead.",
  rate: "Pick a pace.",
  band: "Pick a band.",
  cadence: "Pick how often to weigh in.",
};

interface WeightGoalSheetProps {
  open: boolean;
  view: WeightView | null;
  onClose: () => void;
  onSaved: (view: WeightView) => void;
  onDeleted: () => void;
}

// No effect resyncing the draft on reopen: WeightRow remounts this component
// with a fresh `key` per open, so state starts clean. Cancel is Sheet's own
// Escape/backdrop/✕ and writes nothing.
export const WeightGoalSheet = ({ open, view, onClose, onSaved, onDeleted }: WeightGoalSheetProps) => {
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

  const remove = (): void => {
    setIsSaving(true);
    setHasError(false);
    deleteWeightGoal()
      .then(() => {
        onDeleted();
        onClose();
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
      <div className="flex flex-col gap-6">
        <ModeChoice mode={draft.mode} onChange={(mode) => setDraft({ ...draft, mode })} />
        <div className="flex flex-col gap-3">
          <Field
            label="Current weight"
            name="current-weight"
            inputMode="decimal"
            value={draft.currentDraft}
            onChange={(event) => setDraft({ ...draft, currentDraft: event.target.value })}
            helperText="kg"
          />
          {draft.mode === "target" && (
            <Field
              label="Target weight"
              name="target-weight"
              inputMode="decimal"
              value={draft.targetDraft}
              onChange={(event) => setDraft({ ...draft, targetDraft: event.target.value })}
              helperText="kg"
            />
          )}
        </div>
        {draft.mode === "target" ? (
          <ChipRow
            label="Pace"
            choices={PACE_CHOICES}
            selected={draft.rateKgPerWeek as (typeof PACE_CHOICES)[number]}
            format={(pace) => `${pace} kg/wk`}
            onChange={(rateKgPerWeek) => setDraft({ ...draft, rateKgPerWeek })}
          />
        ) : (
          <Field
            label="Band"
            name="hold-band"
            inputMode="decimal"
            value={String(draft.bandKg)}
            onChange={(event) => setDraft({ ...draft, bandKg: Number(event.target.value.replace(",", ".")) })}
            helperText="± kg"
          />
        )}
        <ChipRow
          label="Weigh in"
          choices={CHECKIN_INTERVALS}
          selected={draft.checkinIntervalDays as (typeof CHECKIN_INTERVALS)[number]}
          format={cadenceLabel}
          onChange={(checkinIntervalDays) => setDraft({ ...draft, checkinIntervalDays })}
        />
        {/* The user's own two numbers, divided. No calorie figure appears here
            or anywhere else in this feature. */}
        {projection && <p className="text-sm text-text-muted">{projection}</p>}
        {rejection && <InlineMessage tone="info">{rejection}</InlineMessage>}
        {hasError && <InlineMessage tone="error">Could not save. Please try again.</InlineMessage>}
        {view && (
          <Button variant="danger" link className="self-start" onClick={remove}>
            Delete goal
          </Button>
        )}
      </div>
    </Sheet>
  );
};
