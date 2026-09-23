// Pure draft handling and every string the estimate page prints. The type
// import from intake.ts is erased at build; nothing here reaches the server.
import type { IntakePrefill, IntakeSaveInput } from "@/features/intake/actions/intake";
import {
  estimateIntake,
  intakeInputError,
  roundKcal,
  stageBodyFatPct,
  stageForBodyFat,
  type ActivityLevel,
  type BodyFatStage,
  type IntakeField,
  type IntakeProfile,
  type IntakeReady,
  type IntakeSex,
  type PrimaryGoal,
  type RefusalReason,
  type TrainingStyle,
  type TrainingYears,
} from "@/features/intake/actions/intake.utils";
import { MAX_WINDOW_DAYS, type MeasuredBurn } from "@/features/intake/actions/measured-burn.utils";
import {
  bandPresets,
  convertedPreset,
  defaultBand,
  displayWeight,
  draftToKg,
  draftToRangedKg,
  fromKg,
  parseDecimalDraft,
  roundToHundredth,
  roundToTenth,
  type WeightUnit,
} from "@/features/weight/actions/weight.utils";
import { addCalendarDays } from "@/lib/date/day-bounds";

export type MetabolismDirection = "up" | "down";

// Every field holds text while it is typed, in the unit on screen; only
// draftToInput turns it into kg and cm.
export interface IntakeDraft {
  unit: WeightUnit;
  sex: IntakeSex | null;
  birthYearDraft: string;
  heightCmDraft: string;
  heightFtDraft: string;
  heightInDraft: string;
  weightDraft: string;
  activityLevel: ActivityLevel | null;
  primaryGoal: PrimaryGoal | null;
  goalWeightDraft: string;
  paceDraft: string;
  bandDraft: string;
  recomp: boolean;
  bodyFatDraft: string;
  bodyFatStage: BodyFatStage | null;
  trainingStyle: TrainingStyle | null;
  strengthDaysDraft: string;
  trainingYears: TrainingYears | null;
  trackingPeriodDraft: string;
  pregnantOrBreastfeeding: boolean;
  metabolismCondition: boolean;
  metabolismDirection: MetabolismDirection;
  metabolismPctDraft: string;
  saveAnswers: boolean;
}

export type BarState =
  | { kind: "incomplete"; missing: number }
  | { kind: "invalid"; field: IntakeField }
  | { kind: "refused"; reason: RefusalReason }
  | { kind: "ready"; estimate: IntakeReady };

// Exact by definition (international inch, 1959).
const CM_PER_INCH = 2.54;
const INCHES_PER_FOOT = 12;
const DAYS_PER_WEEK = 7;
const PERCENT = 100;
const NO_BAND = 0;

export const hasDirection = (goal: PrimaryGoal | null): boolean =>
  goal === "lose_fat" || goal === "gain_muscle";

const isFilled = (text: string): boolean =>
  Number.isFinite(parseDecimalDraft(text));

const optionalNumber = (text: string): number | null =>
  isFilled(text) ? parseDecimalDraft(text) : null;

const inchesOrZero = (text: string): number => optionalNumber(text) ?? 0;

const heightCmOf = (draft: IntakeDraft): number =>
  draft.unit === "kg"
    ? parseDecimalDraft(draft.heightCmDraft)
    : (parseDecimalDraft(draft.heightFtDraft) * INCHES_PER_FOOT +
        inchesOrZero(draft.heightInDraft)) *
      CM_PER_INCH;

// Whole inches: a tape in feet reads to the inch, and rounding the total first
// means 71.9 in never becomes "5 ft 12".
const feetAndInches = (
  heightCm: number,
): { heightFtDraft: string; heightInDraft: string } => {
  const totalInches = Math.round(heightCm / CM_PER_INCH);
  return {
    heightFtDraft: String(Math.floor(totalInches / INCHES_PER_FOOT)),
    heightInDraft: String(totalInches % INCHES_PER_FOOT),
  };
};

const heightDrafts = (heightCm: number | null, unit: WeightUnit) => {
  if (heightCm === null)
    return { heightCmDraft: "", heightFtDraft: "", heightInDraft: "" };
  return unit === "kg"
    ? { heightCmDraft: String(heightCm), heightFtDraft: "", heightInDraft: "" }
    : { heightCmDraft: "", ...feetAndInches(heightCm) };
};

const weightText = (weightKg: number | null, unit: WeightUnit): string =>
  weightKg === null ? "" : String(displayWeight(weightKg, unit));

const paceText = (kgPerWeek: number | null, unit: WeightUnit): string =>
  kgPerWeek === null ? "" : String(roundToHundredth(fromKg(kgPerWeek, unit)));

const textOf = (value: number | null): string =>
  value === null ? "" : String(value);

type ProfileDrafts = Omit<
  IntakeDraft,
  "unit" | "weightDraft" | "goalWeightDraft" | "paceDraft" | "bandDraft" | "recomp"
>;

const EMPTY_PROFILE_DRAFTS: ProfileDrafts = {
  sex: null,
  birthYearDraft: "",
  heightCmDraft: "",
  heightFtDraft: "",
  heightInDraft: "",
  activityLevel: null,
  primaryGoal: null,
  bodyFatDraft: "",
  bodyFatStage: null,
  trainingStyle: null,
  strengthDaysDraft: "",
  trainingYears: null,
  trackingPeriodDraft: "",
  pregnantOrBreastfeeding: false,
  metabolismCondition: false,
  metabolismDirection: "down",
  metabolismPctDraft: "",
  saveAnswers: false,
};

// A visual stage comes back as a stage; a typed figure, or a stage whose
// midpoint no longer matches after the sex answer changed, comes back typed.
const bodyFatDrafts = (profile: IntakeProfile) => {
  if (profile.bodyFatPct === null)
    return { bodyFatDraft: "", bodyFatStage: null };
  const stage =
    profile.bodyFatSource === "visual"
      ? stageForBodyFat(profile.bodyFatPct, profile.sex)
      : null;
  return stage
    ? { bodyFatDraft: "", bodyFatStage: stage }
    : { bodyFatDraft: String(profile.bodyFatPct), bodyFatStage: null };
};

const profileDrafts = (
  profile: IntakeProfile | null,
  unit: WeightUnit,
): ProfileDrafts => {
  if (profile === null) return EMPTY_PROFILE_DRAFTS;
  const pct = profile.metabolismAdjustPct;
  return {
    ...EMPTY_PROFILE_DRAFTS,
    sex: profile.sex,
    birthYearDraft: String(profile.birthYear),
    ...heightDrafts(profile.heightCm, unit),
    activityLevel: profile.activityLevel,
    primaryGoal: profile.primaryGoal,
    ...bodyFatDrafts(profile),
    trainingStyle: profile.trainingStyle,
    strengthDaysDraft: textOf(profile.strengthDaysPerWeek),
    trainingYears: profile.trainingYears,
    trackingPeriodDraft: textOf(profile.trackingPeriodDays),
    pregnantOrBreastfeeding: profile.pregnantOrBreastfeeding,
    metabolismCondition: profile.metabolismCondition,
    metabolismDirection: pct !== null && pct > 0 ? "up" : "down",
    metabolismPctDraft: pct === null ? "" : String(Math.abs(pct)),
    // A stored row exists only because the box was ticked; it renders ticked.
    saveAnswers: true,
  };
};

// The band starts on the weight sheet's own default, so Maintain saves a hold
// goal unless the user sets 0. A saved Maintain answer with no hold goal is
// someone who already set 0, and it comes back as 0.
const bandDraftOf = (prefill: IntakePrefill): string => {
  if (prefill.holdGoal) return paceText(prefill.holdGoal.holdBandKg, prefill.unit);
  if (prefill.profile?.primaryGoal === "maintain") return String(NO_BAND);
  return String(defaultBand(prefill.unit));
};

export const initialDraft = (prefill: IntakePrefill): IntakeDraft => ({
  ...profileDrafts(prefill.profile, prefill.unit),
  unit: prefill.unit,
  weightDraft: weightText(prefill.latestWeightKg, prefill.unit),
  goalWeightDraft: weightText(
    prefill.targetGoal?.targetWeightKg ?? null,
    prefill.unit,
  ),
  paceDraft: paceText(prefill.targetGoal?.rateKgPerWeek ?? null, prefill.unit),
  bandDraft: bandDraftOf(prefill),
  recomp: prefill.holdGoal?.recomp ?? false,
});

// Flipping the unit re-expresses what is typed rather than clearing it: a
// draft the user cannot get back is a cancel they did not ask for.
const reexpressWeight = (
  text: string,
  from: WeightUnit,
  to: WeightUnit,
): string =>
  text.trim() === ""
    ? text
    : String(displayWeight(draftToRangedKg(text, from), to));

const reexpressPace = (
  text: string,
  from: WeightUnit,
  to: WeightUnit,
): string =>
  text.trim() === "" ? text : paceText(draftToRangedKg(text, from), to);

const reexpressHeight = (draft: IntakeDraft, to: WeightUnit) => {
  const heightCm = heightCmOf(draft);
  return heightDrafts(
    Number.isFinite(heightCm) ? roundToTenth(heightCm) : null,
    to,
  );
};

export const convertUnit = (
  draft: IntakeDraft,
  unit: WeightUnit,
): IntakeDraft => ({
  ...draft,
  ...reexpressHeight(draft, unit),
  unit,
  weightDraft: reexpressWeight(draft.weightDraft, draft.unit, unit),
  goalWeightDraft: reexpressWeight(draft.goalWeightDraft, draft.unit, unit),
  paceDraft: reexpressPace(draft.paceDraft, draft.unit, unit),
  bandDraft:
    convertedPreset(draft.bandDraft, bandPresets, draft.unit, unit) ??
    reexpressPace(draft.bandDraft, draft.unit, unit),
});

export const missingRequiredCount = (draft: IntakeDraft): number =>
  [
    draft.sex !== null,
    isFilled(draft.birthYearDraft),
    Number.isFinite(heightCmOf(draft)),
    isFilled(draft.weightDraft),
    draft.activityLevel !== null,
    draft.primaryGoal !== null,
  ].filter((isAnswered) => !isAnswered).length;

const bodyFatOf = (
  draft: IntakeDraft,
  sex: IntakeSex,
): Pick<IntakeProfile, "bodyFatPct" | "bodyFatSource"> => {
  if (draft.bodyFatStage !== null) {
    return {
      bodyFatPct: stageBodyFatPct(draft.bodyFatStage, sex),
      bodyFatSource: "visual",
    };
  }
  const typed = optionalNumber(draft.bodyFatDraft);
  return typed === null
    ? { bodyFatPct: null, bodyFatSource: null }
    : { bodyFatPct: typed, bodyFatSource: "typed" };
};

const metabolismOf = (draft: IntakeDraft): number | null => {
  const pct = draft.metabolismCondition
    ? optionalNumber(draft.metabolismPctDraft)
    : null;
  if (pct === null) return null;
  return draft.metabolismDirection === "up" ? pct : -pct;
};

// 0 and empty both mean "no hold goal".
const bandOf = (draft: IntakeDraft): number | null => {
  const bandKg = optionalNumber(draft.bandDraft);
  return bandKg === null || bandKg === NO_BAND ? null : draftToRangedKg(draft.bandDraft, draft.unit);
};

const goalFieldsOf = (draft: IntakeDraft, goal: PrimaryGoal) => {
  if (!hasDirection(goal)) {
    return { goalWeightKg: null, paceKgPerWeek: null, holdBandKg: bandOf(draft), recomp: draft.recomp };
  }
  return {
    holdBandKg: null,
    recomp: false,
    goalWeightKg: isFilled(draft.goalWeightDraft)
      ? draftToKg(draft.goalWeightDraft, draft.unit)
      : null,
    paceKgPerWeek: isFilled(draft.paceDraft)
      ? draftToRangedKg(draft.paceDraft, draft.unit)
      : null,
  };
};

const optionalFieldsOf = (draft: IntakeDraft, sex: IntakeSex) => ({
  ...bodyFatOf(draft, sex),
  trainingStyle: draft.trainingStyle,
  strengthDaysPerWeek: optionalNumber(draft.strengthDaysDraft),
  trainingYears: draft.trainingYears,
  trackingPeriodDays: optionalNumber(draft.trackingPeriodDraft),
  // The question is hidden for a male answer; a tick left over from before
  // the answer changed must not refuse the estimate.
  pregnantOrBreastfeeding: sex !== "male" && draft.pregnantOrBreastfeeding,
  metabolismCondition: draft.metabolismCondition,
  metabolismAdjustPct: metabolismOf(draft),
});

export const draftToInput = (draft: IntakeDraft): IntakeSaveInput | null => {
  const { sex, activityLevel, primaryGoal } = draft;
  if (
    missingRequiredCount(draft) > 0 ||
    sex === null ||
    activityLevel === null ||
    primaryGoal === null
  )
    return null;
  return {
    unit: draft.unit,
    sex,
    birthYear: parseDecimalDraft(draft.birthYearDraft),
    heightCm: roundToTenth(heightCmOf(draft)),
    weightKg: draftToKg(draft.weightDraft, draft.unit),
    activityLevel,
    primaryGoal,
    ...goalFieldsOf(draft, primaryGoal),
    ...optionalFieldsOf(draft, sex),
    saveAnswers: draft.saveAnswers,
  };
};

export const barStateOf = (
  draft: IntakeDraft,
  currentYear: number,
): BarState => {
  const input = draftToInput(draft);
  if (input === null)
    return { kind: "incomplete", missing: missingRequiredCount(draft) };
  const field = intakeInputError(input, currentYear);
  if (field) return { kind: "invalid", field };
  const estimate = estimateIntake(input, currentYear);
  return estimate.kind === "refused"
    ? { kind: "refused", reason: estimate.reason }
    : { kind: "ready", estimate };
};

// Opens the "Sharpen" group on a returning visit, so a stored answer is never
// hidden behind a closed disclosure.
export const hasSharpenAnswers = (draft: IntakeDraft): boolean =>
  draft.bodyFatDraft !== "" ||
  draft.bodyFatStage !== null ||
  draft.trainingStyle !== null ||
  draft.strengthDaysDraft !== "" ||
  draft.trainingYears !== null ||
  draft.pregnantOrBreastfeeding ||
  draft.metabolismCondition;

// en-GB, not the browser default, so a figure reads the same in every test
// run and on every device ("2,320", never "2.320").
const KCAL_FORMAT = new Intl.NumberFormat("en-GB");
const DAY_MONTH_FORMAT = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "long",
  timeZone: "UTC",
});

const kcalText = (kcal: number): string => KCAL_FORMAT.format(roundKcal(kcal));

// U+2212, the same minus the weight panel prints for a signed change.
const signedKcalText = (kcal: number): string =>
  `${kcal < 0 ? "−" : "+"}${kcalText(Math.abs(kcal))}`;

export const rangeText = (estimate: IntakeReady): string =>
  `${kcalText(estimate.lowKcal)}–${kcalText(estimate.highKcal)} kcal a day`;

export const applyButtonText = (estimate: IntakeReady): string =>
  `Use ${kcalText(estimate.pointKcal)}`;

export const incompleteText = (missing: number): string =>
  `Fill in ${missing} more to see your estimate`;

export const INVALID_BAR_TEXT =
  "Fix the field marked above to see your estimate.";

export const REFUSAL_TEXT: Record<RefusalReason, string> = {
  under_18:
    "This estimate is built for adults. For under-18s, ask a doctor or dietitian.",
  pregnancy:
    "This estimate doesn't cover pregnancy or breastfeeding. Your midwife or doctor can give you a figure.",
};

// The last sentence describes the measured burn (spec 2026-09-23). It used to
// say "about 2 weeks", which that spec's §4.7 shows is not enough for most
// users to clear the error ceiling - the copy was corrected rather than the
// ceiling loosened.
export const DISCLAIMER_TEXT =
  "An estimate from published formulas, not medical advice. Real needs can differ by 10% or more. Log your meals and weight for a few weeks and the app will work out your real calorie burn from them.";

export const CONDITION_DISCLAIMER_TEXT =
  "With a condition that affects metabolism, check this figure with your doctor.";

const FIELD_TEXT: Record<Exclude<IntakeField, "goal_direction">, string> = {
  birth_year: "Enter the year you were born.",
  height: "Enter your height.",
  weight: "Enter your current weight.",
  goal_weight: "Enter a goal weight we can use, or leave it empty.",
  pace: "Enter a pace above zero, or leave it empty.",
  band: "Enter a band, or 0 for no weight goal.",
  recomp: "Recomp is saved with your weight goal. Enter a band above 0, or untick Recomp.",
  body_fat: "Enter a body fat from 3 to 60%, or leave it empty.",
  strength_days: "Enter 0 to 7 days.",
  tracking_period: "Enter 1 to 365 days, or leave it empty.",
  metabolism: "Enter a figure from 1 to 30%, or leave it empty.",
};

export const fieldText = (
  field: IntakeField,
  goal: PrimaryGoal | null,
): string => {
  if (field !== "goal_direction") return FIELD_TEXT[field];
  return goal === "gain_muscle"
    ? "To gain weight, the goal weight needs to be above your current weight."
    : "To lose weight, the goal weight needs to be below your current weight.";
};

const isLine = (line: string | null): line is string => line !== null;

// Each notice states a fact about this estimate. None judges the user.
export const noticeLines = (estimate: IntakeReady): string[] =>
  [
    estimate.isMaintenanceOnly
      ? `Your BMI is ${roundToTenth(estimate.bmi)}, so this shows maintenance, not a deficit.`
      : null,
    estimate.isPaceOverCap && estimate.paceCapSharePerWeek !== null
      ? `That pace is more than ${estimate.paceCapSharePerWeek * PERCENT}% of your weight a week.`
      : null,
    estimate.isFloored
      ? `The estimate stops at ${kcalText(estimate.floorKcal)} kcal, the lowest it will suggest.`
      : null,
  ].filter(isLine);

const paceLine = (estimate: IntakeReady, unit: WeightUnit): string | null => {
  if (estimate.paceKgPerWeek === null || estimate.adjustmentKcal === 0)
    return null;
  const suggested = estimate.isPaceSuggested ? " (suggested)" : "";
  return `${signedKcalText(estimate.adjustmentKcal)} kcal a day for ${paceText(estimate.paceKgPerWeek, unit)} ${unit}/week${suggested}`;
};

const bodyLine = (estimate: IntakeReady, unit: WeightUnit): string => {
  const bmi = `BMI ${roundToTenth(estimate.bmi)}`;
  if (estimate.leanMassKg === null || estimate.ffmi === null) return bmi;
  return `${bmi} · lean mass ${displayWeight(estimate.leanMassKg, unit)} ${unit} · FFMI ${roundToTenth(estimate.ffmi)}`;
};

// The measured path replaces the BMR line rather than sitting beside it: BMR
// is still computed for the floor, but it is not what produced this figure,
// and two maintenance lines would read as two answers.
const maintenanceLines = (estimate: IntakeReady, measured: MeasuredBurn | null): string[] => {
  if (measured?.kind === "measured" && estimate.isMeasured) {
    return [
      `Maintenance ${kcalText(estimate.maintenanceKcal)} kcal`,
      `from ${measured.loggedDays} logged days of the last ${measured.windowDays}`,
      `Formula said ${kcalText(estimate.formulaMaintenanceKcal)}.`,
    ];
  }
  const formulaLine = `BMR ${kcalText(estimate.bmrKcal)} kcal · maintenance ${kcalText(estimate.maintenanceKcal)} kcal`;
  if (measured?.kind !== "insufficient") return [formulaLine];
  return [
    formulaLine,
    "Measured burn needs a few weeks of logged meals and weigh-ins.",
    `You have ${measured.loggedDays} logged days and ${measured.readings} weigh-ins in the last ${MAX_WINDOW_DAYS}.`,
  ];
};

export const detailLines = (
  estimate: IntakeReady,
  unit: WeightUnit,
  measured: MeasuredBurn | null,
): string[] =>
  [...maintenanceLines(estimate, measured), paceLine(estimate, unit), bodyLine(estimate, unit)].filter(isLine);

const weeksText = (weeks: number): string =>
  weeks === 1 ? "1 week" : `${weeks} weeks`;

export const timelineText = (
  estimate: IntakeReady,
  today: string,
): string | null => {
  if (estimate.weeksToGoal === null) return null;
  const weeks = Math.max(1, Math.round(estimate.weeksToGoal));
  const date = addCalendarDays(
    today,
    Math.round(estimate.weeksToGoal * DAYS_PER_WEEK),
  );
  const dateText = DAY_MONTH_FORMAT.format(new Date(`${date}T00:00:00Z`));
  return `About ${weeksText(weeks)}, around ${dateText}, if the pace holds. Real progress usually slows.`;
};

// The field writes the weight goal on save, so its helper says so up front -
// a user who only wanted a calorie figure can leave it empty.
export const goalWeightHelperText = (hasWeightGoal: boolean): string =>
  hasWeightGoal
    ? "Optional. A change here updates your weight goal."
    : "Optional, but recommended. How fast you want to reach it affects your daily calories. You can also add it later on today's screen.";

export const BAND_SAVE_TEXT = "Saved as your weight goal. Enter 0 to skip it.";

export const suggestedPaceText = (estimate: IntakeReady, unit: WeightUnit): string | undefined =>
  estimate.isPaceSuggested && estimate.paceKgPerWeek !== null
    ? `Suggested: ${paceText(estimate.paceKgPerWeek, unit)} ${unit}/wk. Leave empty to use it.`
    : undefined;

// What the polite live region reads once the typing settles.
export const announcementOf = (state: BarState): string => {
  switch (state.kind) {
    case "incomplete":
      return incompleteText(state.missing);
    case "invalid":
      return INVALID_BAR_TEXT;
    case "refused":
      return REFUSAL_TEXT[state.reason];
    case "ready":
      return rangeText(state.estimate);
    default: {
      const _exhaustive: never = state;
      return _exhaustive;
    }
  }
};
