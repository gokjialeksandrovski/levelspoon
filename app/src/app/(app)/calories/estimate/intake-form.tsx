"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import {
  forgetIntakeProfile,
  saveIntakeEstimate,
  type IntakePrefill,
  type IntakeSaveInput,
  type SaveIntakeResult,
} from "@/features/intake/actions/intake";
import {
  BODY_FAT_STAGES,
  yearOf,
  type ActivityLevel,
  type BodyFatStage,
  type IntakeField,
  type IntakeSex,
  type PrimaryGoal,
  type TrackingStyle,
  type TrainingStyle,
  type TrainingYears,
} from "@/features/intake/actions/intake.utils";
import { pacePresets } from "@/features/weight/actions/weight.utils";
import { PresetField, UnitSuffix, UnitToggle } from "@/features/weight/components/weight-fields";
import { AppHeader } from "@/components/layout/app-header";
import { Button } from "@/components/ui/button";
import { Disclosure } from "@/components/ui/disclosure";
import { Field } from "@/components/ui/field";
import { InlineMessage } from "@/components/ui/inline-message";
import { todayLocalDateString } from "@/lib/date/day-bounds";

import { CheckboxRow, ChoiceGroup, RequiredMark, type ChoiceOption } from "./intake-choices";
import {
  barStateOf,
  convertUnit,
  draftToInput,
  fieldText,
  hasDirection,
  hasSharpenAnswers,
  initialDraft,
  suggestedPaceText,
  type BarState,
  type IntakeDraft,
  type MetabolismDirection,
} from "./intake-form.utils";
import { ResultBar } from "./result-bar";

const SEX_OPTIONS: ChoiceOption<IntakeSex>[] = [
  { value: "male", label: "Male" },
  { value: "female", label: "Female" },
  { value: "unspecified", label: "Prefer not to say" },
];

const ACTIVITY_OPTIONS: ChoiceOption<ActivityLevel>[] = [
  { value: "sedentary", label: "Mostly sitting", description: "Desk job, little walking, no regular exercise." },
  {
    value: "light",
    label: "Lightly active",
    description: "On your feet part of the day, or 1–3 workouts a week. Teacher, shop work, a daily walk.",
  },
  {
    value: "moderate",
    label: "Active",
    description: "On your feet most of the day, or 3–5 workouts a week. Waiter, nurse, regular gym.",
  },
  {
    value: "very",
    label: "Very active",
    description: "Physical job, or hard training 6–7 days a week. Builder, courier on foot.",
  },
  {
    value: "extreme",
    label: "Extremely active",
    description: "Hard physical job plus training, or training twice a day.",
  },
];

const GOAL_OPTIONS: ChoiceOption<PrimaryGoal>[] = [
  { value: "lose_fat", label: "Lose weight" },
  { value: "maintain", label: "Maintain" },
  { value: "gain_muscle", label: "Gain weight" },
  { value: "recomp", label: "Recomp" },
];

// Under the grid, not inside a card: a description in one card made it twice
// the height of its row-mates. Shown only once Recomp is picked.
const RECOMP_NOTE = "Lose fat and build muscle at the same time, eating around maintenance.";

const STAGE_LABEL: Record<BodyFatStage, string> = {
  abs: "Visible abs",
  flat: "Flat stomach, some outline",
  soft: "Soft stomach, small belly",
  belly: "Belly over the belt",
  large: "Large belly",
};

const STAGE_OPTIONS: ChoiceOption<BodyFatStage>[] = BODY_FAT_STAGES.map((stage) => ({
  value: stage,
  label: STAGE_LABEL[stage],
}));

const TRAINING_STYLE_OPTIONS: ChoiceOption<TrainingStyle>[] = [
  { value: "sedentary", label: "Mostly sitting" },
  { value: "cardio", label: "Mostly cardio" },
  { value: "strength", label: "Mostly strength" },
  { value: "mixed", label: "Mixed" },
];

const TRAINING_YEARS_OPTIONS: ChoiceOption<TrainingYears>[] = [
  { value: "none", label: "None" },
  { value: "under_1", label: "Under 1" },
  { value: "1_to_3", label: "1–3" },
  { value: "over_3", label: "Over 3" },
];

const TRACKING_OPTIONS: ChoiceOption<TrackingStyle>[] = [
  { value: "daily", label: "A strict daily target" },
  { value: "weekly_average", label: "A weekly average" },
];

const DIRECTION_OPTIONS: ChoiceOption<MetabolismDirection>[] = [
  { value: "up", label: "Up" },
  { value: "down", label: "Down" },
];

// DRAFT consent copy - pending legal review (spec §13.1). Once approved it is
// verbatim, same rule as the AI-photo consent, and a change bumps
// CONSENT_VERSION in intake.utils.ts.
const CONSENT_LABEL = "Save my answers so I don't have to enter them again.";
const CONSENT_HELPER =
  'Your answers include health information. We store them only to fill in this form next time and never share them. Tap "Forget these details" at any time to delete them.';

const browserTimezone = (): string => Intl.DateTimeFormat().resolvedOptions().timeZone;

interface SectionProps {
  draft: IntakeDraft;
  update: (patch: Partial<IntakeDraft>) => void;
  errorFor: (field: IntakeField) => string | undefined;
}

const HeightFields = ({ draft, update, errorFor }: SectionProps) =>
  draft.unit === "kg" ? (
    <Field
      label={
        <>
          Height
          <RequiredMark />
        </>
      }
      required
      name="height-cm"
      inputMode="decimal"
      value={draft.heightCmDraft}
      error={errorFor("height")}
      onChange={(event) => update({ heightCmDraft: event.target.value })}
      trailing={<UnitSuffix>cm</UnitSuffix>}
    />
  ) : (
    <div className="grid grid-cols-2 gap-3">
      <Field
        label={
          <>
            Height, feet
            <RequiredMark />
          </>
        }
        required
        name="height-ft"
        inputMode="numeric"
        value={draft.heightFtDraft}
        error={errorFor("height")}
        onChange={(event) => update({ heightFtDraft: event.target.value })}
        trailing={<UnitSuffix>ft</UnitSuffix>}
      />
      <Field
        label="Height, inches"
        name="height-in"
        inputMode="numeric"
        value={draft.heightInDraft}
        onChange={(event) => update({ heightInDraft: event.target.value })}
        trailing={<UnitSuffix>in</UnitSuffix>}
      />
    </div>
  );

const AboutYou = ({ draft, update, errorFor }: SectionProps) => (
  <section aria-labelledby="about-you" className="flex flex-col gap-4">
    <div className="flex flex-col gap-1">
      <h2 id="about-you" className="font-display text-lg font-semibold">
        About you
      </h2>
      <p className="text-xs text-text-muted">
        <span aria-hidden="true">* </span>Needed for an estimate.
      </p>
    </div>
    <div className="flex flex-col gap-6">
      <ChoiceGroup
        legend="Sex for calculations"
        name="sex"
        layout="grid"
        required
        options={SEX_OPTIONS}
        value={draft.sex}
        helperText="The formulas differ by sex. Prefer not to say averages both and widens the range."
        onChange={(sex) => update({ sex })}
      />
      <Field
        label={
          <>
            Birth year
            <RequiredMark />
          </>
        }
        required
        name="birth-year"
        inputMode="numeric"
        value={draft.birthYearDraft}
        error={errorFor("birth_year")}
        onChange={(event) => update({ birthYearDraft: event.target.value })}
      />
      <HeightFields draft={draft} update={update} errorFor={errorFor} />
      <Field
        label={
          <>
            Current weight
            <RequiredMark />
          </>
        }
        required
        name="current-weight"
        inputMode="decimal"
        value={draft.weightDraft}
        error={errorFor("weight")}
        onChange={(event) => update({ weightDraft: event.target.value })}
        trailing={<UnitToggle unit={draft.unit} onChange={(unit) => update(convertUnit(draft, unit))} />}
        trailingReserveClass="pr-24"
      />
      <ChoiceGroup
        legend="Activity level"
        name="activity"
        required
        options={ACTIVITY_OPTIONS}
        value={draft.activityLevel}
        onChange={(activityLevel) => update({ activityLevel })}
      />
      <ChoiceGroup
        legend="Primary goal"
        name="goal"
        layout="grid"
        required
        options={GOAL_OPTIONS}
        value={draft.primaryGoal}
        note={draft.primaryGoal === "recomp" ? RECOMP_NOTE : undefined}
        onChange={(primaryGoal) => update({ primaryGoal })}
      />
    </div>
  </section>
);

interface YourGoalProps extends SectionProps {
  paceHelper: string | undefined;
}

// Hidden for maintain and recomp: neither moves the scale on purpose, so a
// goal weight there has no direction and a pace nothing to set.
const YourGoal = ({ draft, update, errorFor, paceHelper }: YourGoalProps) => {
  if (!hasDirection(draft.primaryGoal)) return null;
  return (
    <section aria-labelledby="your-goal" className="flex flex-col gap-4">
      <h2 id="your-goal" className="font-display text-lg font-semibold">
        Your goal
      </h2>
      <div className="flex flex-col gap-6">
        <Field
          label="Goal weight"
          name="goal-weight"
          inputMode="decimal"
          value={draft.goalWeightDraft}
          error={errorFor("goal_weight") ?? errorFor("goal_direction")}
          onChange={(event) => update({ goalWeightDraft: event.target.value })}
          trailing={<UnitSuffix>{draft.unit}</UnitSuffix>}
        />
        <PresetField
          label="Pace"
          name="pace"
          suffix={`${draft.unit}/wk`}
          value={draft.paceDraft}
          presets={pacePresets(draft.unit)}
          helperText={errorFor("pace") ?? paceHelper}
          onChange={(paceDraft) => update({ paceDraft })}
        />
        {draft.goalWeightDraft.trim() !== "" && (
          <CheckboxRow
            name="track-weight-goal"
            label="Also track as my weight goal"
            checked={draft.trackAsWeightGoal}
            onChange={(trackAsWeightGoal) => update({ trackAsWeightGoal })}
          />
        )}
      </div>
    </section>
  );
};

const MetabolismFields = ({ draft, update, errorFor }: SectionProps) => (
  <div className="flex flex-col gap-3">
    <CheckboxRow
      name="metabolism"
      label="A health condition affects my metabolism"
      checked={draft.metabolismCondition}
      onChange={(metabolismCondition) => update({ metabolismCondition })}
    />
    {draft.metabolismCondition && (
      <>
        <ChoiceGroup
          legend="It has moved my metabolism"
          name="metabolism-direction"
          layout="grid"
          options={DIRECTION_OPTIONS}
          value={draft.metabolismDirection}
          onChange={(metabolismDirection) => update({ metabolismDirection })}
        />
        <Field
          label="By about"
          name="metabolism-pct"
          inputMode="numeric"
          value={draft.metabolismPctDraft}
          error={errorFor("metabolism")}
          helperText="Your own or your doctor's estimate. Leave empty if you don't know."
          onChange={(event) => update({ metabolismPctDraft: event.target.value })}
          trailing={<UnitSuffix>%</UnitSuffix>}
        />
      </>
    )}
  </div>
);

// Typing a figure clears a picked stage and picking a stage clears the figure:
// one body fat, one control in play at a time.
const BodyFatFields = ({ draft, update, errorFor }: SectionProps) => (
  <div className="flex flex-col gap-3">
    <Field
      label="Body fat"
      name="body-fat"
      inputMode="decimal"
      value={draft.bodyFatDraft}
      error={errorFor("body_fat")}
      onChange={(event) => update({ bodyFatDraft: event.target.value, bodyFatStage: null })}
      trailing={<UnitSuffix>%</UnitSuffix>}
    />
    <ChoiceGroup
      legend="Or pick the closest"
      name="body-fat-stage"
      options={STAGE_OPTIONS}
      value={draft.bodyFatStage}
      onChange={(bodyFatStage) => update({ bodyFatStage, bodyFatDraft: "" })}
    />
  </div>
);

const TrainingFields = ({ draft, update, errorFor }: SectionProps) => (
  <div className="flex flex-col gap-6">
    <ChoiceGroup
      legend="Training"
      name="training-style"
      layout="grid"
      options={TRAINING_STYLE_OPTIONS}
      value={draft.trainingStyle}
      onChange={(trainingStyle) => update({ trainingStyle })}
    />
    <Field
      label="Strength days a week"
      name="strength-days"
      inputMode="numeric"
      value={draft.strengthDaysDraft}
      error={errorFor("strength_days")}
      onChange={(event) => update({ strengthDaysDraft: event.target.value })}
    />
    <ChoiceGroup
      legend="Years training"
      name="training-years"
      layout="grid"
      options={TRAINING_YEARS_OPTIONS}
      value={draft.trainingYears}
      onChange={(trainingYears) => update({ trainingYears })}
    />
  </div>
);

const SharpenFields = (props: SectionProps) => (
  <div className="flex flex-col gap-6 pt-4">
    <p className="text-xs text-text-muted">Optional. Each answer narrows the range.</p>
    <BodyFatFields {...props} />
    <TrainingFields {...props} />
    <ChoiceGroup
      legend="How you'd like to track"
      name="tracking-style"
      options={TRACKING_OPTIONS}
      value={props.draft.trackingStyle}
      helperText="Saved for later. Today's screen shows a daily target either way."
      onChange={(trackingStyle) => props.update({ trackingStyle })}
    />
    {props.draft.sex !== "male" && (
      <CheckboxRow
        name="pregnant"
        label="Pregnant or breastfeeding"
        checked={props.draft.pregnantOrBreastfeeding}
        onChange={(pregnantOrBreastfeeding) => props.update({ pregnantOrBreastfeeding })}
      />
    )}
    <MetabolismFields {...props} />
  </div>
);

// Arming fires no request; Cancel or Escape leaves with nothing changed
// (Rule 21). The resting row names what is stored, so the button is not a
// bare link floating under the consent box.
const ForgetAnswers = ({ onForgotten }: { onForgotten: () => void }) => {
  const [isArmed, setIsArmed] = useState(false);
  const [isForgetting, setIsForgetting] = useState(false);
  const [hasError, setHasError] = useState(false);

  const forget = (): void => {
    setIsForgetting(true);
    setHasError(false);
    forgetIntakeProfile()
      .then(onForgotten)
      .catch(() => setHasError(true))
      .finally(() => setIsForgetting(false));
  };

  if (!isArmed) {
    return (
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-text-muted">Your answers from last time are saved.</p>
        <Button variant="ghost" className="shrink-0" onClick={() => setIsArmed(true)}>
          Forget these details
        </Button>
      </div>
    );
  }
  return (
    <div
      role="group"
      aria-labelledby="forget-prompt"
      className="flex flex-col gap-3"
      onKeyDown={(event) => {
        if (event.key === "Escape") setIsArmed(false);
      }}
    >
      <p id="forget-prompt" className="text-sm text-text">
        Delete your saved answers? Your calorie goal stays.
      </p>
      <div className="flex gap-2">
        <Button variant="danger" className="flex-1" pending={isForgetting} onClick={forget}>
          Forget
        </Button>
        {/* Focus lands on the safe answer: the button that armed this is gone. */}
        <Button variant="ghost" className="flex-1" autoFocus onClick={() => setIsArmed(false)}>
          Cancel
        </Button>
      </div>
      {hasError && <InlineMessage tone="error">Could not forget them. Please try again.</InlineMessage>}
    </div>
  );
};

type StoredAnswers = "saved" | "forgotten" | "none";

interface SavedAnswersProps {
  draft: IntakeDraft;
  stored: StoredAnswers;
  update: (patch: Partial<IntakeDraft>) => void;
  onForgotten: () => void;
}

// Consent and forget sit together: both are about what this page keeps.
const SavedAnswers = ({ draft, stored, update, onForgotten }: SavedAnswersProps) => (
  <section aria-label="Saving your answers" className="flex flex-col gap-4 border-t border-border pt-6">
    <CheckboxRow
      name="save-answers"
      label={CONSENT_LABEL}
      helperText={CONSENT_HELPER}
      checked={draft.saveAnswers}
      onChange={(saveAnswers) => update({ saveAnswers })}
    />
    {stored === "saved" && <ForgetAnswers onForgotten={onForgotten} />}
    {stored === "forgotten" && (
      <p role="status" className="text-sm text-text-muted">
        Your saved answers are deleted.
      </p>
    )}
  </section>
);

// The client ran the same checks before Use was on screen, so a refusal or a
// bad field here means client and server disagree - reported as a failed save,
// never swallowed.
const isSaved = (result: SaveIntakeResult): boolean => {
  switch (result.kind) {
    case "saved":
      return true;
    case "refused":
    case "invalid":
      return false;
    default: {
      const _exhaustive: never = result;
      return _exhaustive;
    }
  }
};

const useSaveIntake = (today: string) => {
  const router = useRouter();
  const [isSaving, setIsSaving] = useState(false);
  const [hasError, setHasError] = useState(false);

  const save = (input: IntakeSaveInput): void => {
    setIsSaving(true);
    setHasError(false);
    saveIntakeEstimate(input, browserTimezone())
      .then((result) => {
        if (isSaved(result)) router.push(`/day/${today}`);
        else setHasError(true);
      })
      .catch(() => setHasError(true))
      .finally(() => setIsSaving(false));
  };

  return { isSaving, hasError, save };
};

const paceHelperOf = (bar: BarState, draft: IntakeDraft): string | undefined =>
  bar.kind === "ready" && draft.paceDraft.trim() === "" ? suggestedPaceText(bar.estimate, draft.unit) : undefined;

export const IntakeForm = ({ prefill }: { prefill: IntakePrefill }) => {
  const [draft, setDraft] = useState(() => initialDraft(prefill));
  const [stored, setStored] = useState<StoredAnswers>(prefill.profile === null ? "none" : "saved");
  const today = todayLocalDateString(browserTimezone());
  const bar = barStateOf(draft, yearOf(today));
  const { isSaving, hasError, save } = useSaveIntake(today);

  const update = (patch: Partial<IntakeDraft>): void => setDraft((current) => ({ ...current, ...patch }));
  const errorFor = (field: IntakeField): string | undefined =>
    bar.kind === "invalid" && bar.field === field ? fieldText(field, draft.primaryGoal) : undefined;
  const use = (): void => {
    const input = draftToInput(draft);
    if (input) save(input);
  };
  const sections = { draft, update, errorFor };

  return (
    <>
      <AppHeader variant="back" title="Work out your calories" backHref={`/day/${today}`} />
      <main id="main-content" tabIndex={-1} className="flex flex-1 flex-col gap-10 px-4 pt-6 pb-8">
        <p className="text-sm text-text-muted">Fill in what you know. The more you add, the narrower the range.</p>
        <AboutYou {...sections} />
        <YourGoal {...sections} paceHelper={paceHelperOf(bar, draft)} />
        <Disclosure label="Sharpen the estimate" defaultOpen={hasSharpenAnswers(draft)}>
          <SharpenFields {...sections} />
        </Disclosure>
        <SavedAnswers
          draft={draft}
          stored={stored}
          update={update}
          onForgotten={() => {
            setStored("forgotten");
            update({ saveAnswers: false });
          }}
        />
      </main>
      <ResultBar
        state={bar}
        unit={draft.unit}
        today={today}
        hasCondition={draft.metabolismCondition}
        isSaving={isSaving}
        hasError={hasError}
        onUse={use}
      />
    </>
  );
};
