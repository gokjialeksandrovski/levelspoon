"use server";

import { eq } from "drizzle-orm";

import { fetchWeightView } from "@/features/weight/actions/weight";
import { fetchLatestWeightKg, upsertWeightEntry, writeWeightGoal } from "@/features/weight/actions/weight.store";
import {
  DEFAULT_CHECKIN_INTERVAL_DAYS,
  fromKg,
  roundToHundredth,
  roundToTenth,
  weightGoalInputError,
  type WeightGoalInput,
  type WeightUnit,
  type WeightView,
} from "@/features/weight/actions/weight.utils";
import { NotAuthenticatedError, requireUserId } from "@/lib/auth/require-user";
import { db, type DbTransaction } from "@/lib/db";
import { intakeProfiles, users } from "@/lib/db/schema";
import { todayLocalDateString } from "@/lib/date/day-bounds";

import {
  CONSENT_VERSION,
  estimateIntake,
  intakeInputError,
  roundKcal,
  yearOf,
  type IntakeField,
  type IntakeInput,
  type IntakeProfile,
  type RefusalReason,
} from "./intake.utils";

// numeric(4,1) / numeric(3,1).
const ONE_DECIMAL = 1;

export interface IntakePrefill {
  unit: WeightUnit;
  latestWeightKg: number | null;
  /** Only a target goal prefills goal weight and pace; a hold has neither. */
  targetGoal: { targetWeightKg: number; rateKgPerWeek: number } | null;
  /** Only a hold goal prefills the band and recomp. */
  holdGoal: { holdBandKg: number; recomp: boolean } | null;
  hasWeightGoal: boolean;
  profile: IntakeProfile | null;
}

export interface IntakeSaveInput extends IntakeInput {
  unit: WeightUnit;
  /** The consent checkbox (spec §13). False writes no answers and deletes any. */
  saveAnswers: boolean;
}

// Refusals travel as data: a Server Action's thrown error reaches a client
// component as a plain Error, subclass and message stripped. Same shape as
// SaveWeightGoalResult.
export type SaveIntakeResult =
  | { kind: "saved"; calorieGoal: number }
  | { kind: "refused"; reason: RefusalReason }
  | { kind: "invalid"; field: IntakeField };

type ProfileRow = typeof intakeProfiles.$inferSelect;

// numeric arrives as a string - this is the point of arithmetic where it
// becomes a number.
const toProfile = (row: ProfileRow): IntakeProfile => ({
  sex: row.sex,
  birthYear: row.birthYear,
  heightCm: Number(row.heightCm),
  activityLevel: row.activityLevel,
  primaryGoal: row.primaryGoal,
  bodyFatPct: row.bodyFatPct === null ? null : Number(row.bodyFatPct),
  bodyFatSource: row.bodyFatSource,
  trainingStyle: row.trainingStyle,
  strengthDaysPerWeek: row.strengthDaysPerWeek,
  trainingYears: row.trainingYears,
  trackingPeriodDays: row.trackingPeriodDays,
  pregnantOrBreastfeeding: row.pregnantOrBreastfeeding,
  metabolismCondition: row.metabolismCondition,
  metabolismAdjustPct: row.metabolismAdjustPct,
});

// Picks the stored answers out of the save input by name: the input also
// carries weight, goal weight and pace, which live in the weight tables.
const toProfileRow = (userId: string, input: IntakeSaveInput) => ({
  userId,
  sex: input.sex,
  birthYear: input.birthYear,
  heightCm: input.heightCm.toFixed(ONE_DECIMAL),
  activityLevel: input.activityLevel,
  primaryGoal: input.primaryGoal,
  bodyFatPct: input.bodyFatPct === null ? null : input.bodyFatPct.toFixed(ONE_DECIMAL),
  bodyFatSource: input.bodyFatSource,
  trainingStyle: input.trainingStyle,
  strengthDaysPerWeek: input.strengthDaysPerWeek,
  trainingYears: input.trainingYears,
  trackingPeriodDays: input.trackingPeriodDays,
  pregnantOrBreastfeeding: input.pregnantOrBreastfeeding,
  metabolismCondition: input.metabolismCondition,
  metabolismAdjustPct: input.metabolismAdjustPct,
  // Re-stamped on every consented save: each one is the user ticking the box
  // again against the wording on screen.
  consentedAt: new Date(),
  consentVersion: CONSENT_VERSION,
  updatedAt: new Date(),
});

const toTargetGoal = (view: WeightView | null): IntakePrefill["targetGoal"] => {
  const goal = view?.goal;
  if (goal?.mode !== "target" || goal.targetWeightKg === null || goal.rateKgPerWeek === null) return null;
  return { targetWeightKg: goal.targetWeightKg, rateKgPerWeek: goal.rateKgPerWeek };
};

const toHoldGoal = (view: WeightView | null): IntakePrefill["holdGoal"] => {
  const goal = view?.goal;
  if (goal?.mode !== "hold" || goal.holdBandKg === null) return null;
  return { holdBandKg: goal.holdBandKg, recomp: goal.recomp };
};

export const getIntakePrefill = async (): Promise<IntakePrefill> => {
  const userId = await requireUserId();
  const [view, latestWeightKg, [userRow], [profileRow]] = await Promise.all([
    fetchWeightView(userId),
    fetchLatestWeightKg(userId),
    db.select({ unit: users.weightUnit }).from(users).where(eq(users.id, userId)),
    db.select().from(intakeProfiles).where(eq(intakeProfiles.userId, userId)),
  ]);
  // A JWT outlives its user row (a reset dev DB): name that, rather than
  // crash on reading the unit off nothing.
  if (!userRow) throw new NotAuthenticatedError();
  return {
    unit: userRow.unit,
    latestWeightKg,
    targetGoal: toTargetGoal(view),
    holdGoal: toHoldGoal(view),
    hasWeightGoal: view !== null,
    profile: profileRow ? toProfile(profileRow) : null,
  };
};

// Compared at the precision the form prints in the user's unit: a goal
// prefilled in pounds and left alone comes back a hair off in kilograms.
const isSameTarget = (
  current: IntakePrefill["targetGoal"],
  targetKg: number,
  rateKgPerWeek: number,
  unit: WeightUnit,
): boolean =>
  current !== null &&
  roundToTenth(fromKg(current.targetWeightKg, unit)) === roundToTenth(fromKg(targetKg, unit)) &&
  roundToHundredth(fromKg(current.rateKgPerWeek, unit)) === roundToHundredth(fromKg(rateKgPerWeek, unit));

const isSameHold = (current: IntakePrefill["holdGoal"], bandKg: number, recomp: boolean, unit: WeightUnit): boolean =>
  current !== null &&
  current.recomp === recomp &&
  roundToHundredth(fromKg(current.holdBandKg, unit)) === roundToHundredth(fromKg(bandKg, unit));

// Maintain with a band is a hold goal, the same way a goal weight is a target
// goal. A band of 0 (null here) saves none and leaves any existing goal alone.
const toHoldGoalInput = (input: IntakeSaveInput, view: WeightView | null): WeightGoalInput | null => {
  if (input.holdBandKg === null) return null;
  if (isSameHold(toHoldGoal(view), input.holdBandKg, input.recomp, input.unit)) return null;
  return {
    mode: "hold",
    unit: input.unit,
    currentWeightKg: input.weightKg,
    targetWeightKg: null,
    rateKgPerWeek: null,
    holdBandKg: roundToHundredth(input.holdBandKg),
    recomp: input.recomp,
    checkinIntervalDays: view?.goal.checkinIntervalDays ?? DEFAULT_CHECKIN_INTERVAL_DAYS,
  };
};

// A goal weight typed here is the weight goal - no separate opt-in, because a
// goal weight nothing keeps is a field that does nothing. An unchanged goal
// writes nothing, so recalculating calories never resets the goal's start and
// its progress.
const toWeightGoalInput = (
  input: IntakeSaveInput,
  paceKgPerWeek: number | null,
  view: WeightView | null,
): WeightGoalInput | null => {
  if (input.primaryGoal === "maintain") return toHoldGoalInput(input, view);
  if (input.goalWeightKg === null || paceKgPerWeek === null) return null;
  const rateKgPerWeek = roundToHundredth(paceKgPerWeek);
  if (isSameTarget(toTargetGoal(view), input.goalWeightKg, rateKgPerWeek, input.unit)) return null;
  return {
    mode: "target",
    unit: input.unit,
    currentWeightKg: input.weightKg,
    targetWeightKg: input.goalWeightKg,
    rateKgPerWeek,
    holdBandKg: null,
    recomp: false,
    checkinIntervalDays: view?.goal.checkinIntervalDays ?? DEFAULT_CHECKIN_INTERVAL_DAYS,
  };
};

// A weight prefilled from an older reading and left alone is that reading, not
// a new one - logging it under today would invent a weigh-in.
const isNewReading = (weightKg: number, latestKg: number | null): boolean =>
  latestKg === null || roundToHundredth(weightKg) !== roundToHundredth(latestKg);

const writeAnswers = async (tx: DbTransaction, userId: string, input: IntakeSaveInput): Promise<void> => {
  if (!input.saveAnswers) {
    // An unticked box on a later save withdraws consent (GDPR Art. 7(3)).
    await tx.delete(intakeProfiles).where(eq(intakeProfiles.userId, userId));
    return;
  }
  const row = toProfileRow(userId, input);
  await tx.insert(intakeProfiles).values(row).onConflictDoUpdate({ target: intakeProfiles.userId, set: row });
};

interface SavePlan {
  userId: string;
  today: string;
  input: IntakeSaveInput;
  calorieGoal: number;
  weightGoal: WeightGoalInput | null;
  writesReading: boolean;
}

// All or nothing: a goal set without the answers the user asked us to keep, or
// a weight goal without its reading, is a half-save the user never chose.
const commitSave = (plan: SavePlan): Promise<void> =>
  db.transaction(async (tx) => {
    // The calorie goal is written here rather than through goals.ts's
    // saveDailyGoals so it joins this transaction; goals.ts owns no rule this
    // skips - its only check is the storage bound a rounded estimate meets.
    await tx
      .update(users)
      .set({ dailyCalorieGoal: plan.calorieGoal, weightUnit: plan.input.unit })
      .where(eq(users.id, plan.userId));
    if (plan.weightGoal) await writeWeightGoal(tx, plan.userId, plan.weightGoal, plan.today);
    if (plan.writesReading) await upsertWeightEntry(tx, plan.userId, plan.today, plan.input.weightKg);
    await writeAnswers(tx, plan.userId, plan.input);
  });

export const saveIntakeEstimate = async (input: IntakeSaveInput, timezone: string): Promise<SaveIntakeResult> => {
  const userId = await requireUserId();
  const today = todayLocalDateString(timezone);
  const currentYear = yearOf(today);

  const field = intakeInputError(input, currentYear);
  if (field) return { kind: "invalid", field };
  // Recomputed here, never read from the browser.
  const estimate = estimateIntake(input, currentYear);
  if (estimate.kind === "refused") return { kind: "refused", reason: estimate.reason };

  const [view, latestKg] = await Promise.all([fetchWeightView(userId), fetchLatestWeightKg(userId)]);
  const weightGoal = toWeightGoalInput(input, estimate.paceKgPerWeek, view);
  if (weightGoal && weightGoalInputError(weightGoal)) {
    return { kind: "invalid", field: weightGoal.mode === "hold" ? "band" : "goal_weight" };
  }

  const calorieGoal = roundKcal(estimate.pointKcal);
  await commitSave({
    userId,
    today,
    input,
    calorieGoal,
    weightGoal,
    // A new goal starts from today's reading, same as the weight sheet.
    writesReading: weightGoal !== null || isNewReading(input.weightKg, latestKg),
  });
  return { kind: "saved", calorieGoal };
};

// Keeps the calorie goal, the readings and the weight goal: those are the
// user's own settings now, not answers to this form.
export const forgetIntakeProfile = async (): Promise<void> => {
  const userId = await requireUserId();
  await db.delete(intakeProfiles).where(eq(intakeProfiles.userId, userId));
};
