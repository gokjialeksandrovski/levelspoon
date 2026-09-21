// app/src/features/weight/actions/weight.ts
"use server";

import { and, desc, eq } from "drizzle-orm";

import { requireUserId } from "@/lib/auth/require-user";
import { db } from "@/lib/db";
import { users, weightEntries, weightGoals } from "@/lib/db/schema";
import { todayLocalDateString } from "@/lib/date/day-bounds";

import { InvalidWeightError, InvalidWeightGoalError } from "./weight.errors";
import { upsertWeightEntry, writeWeightGoal } from "./weight.store";
import {
  isValidWeightKg,
  nextCheckinDate,
  weightGoalInputError,
  type InvalidGoalReason,
  type WeightEntry,
  type WeightGoal,
  type WeightGoalInput,
  type WeightUnit,
  type WeightView,
} from "./weight.utils";

// Two rows: the reading on screen and the one before it, which is all the
// panel's "last change" line needs. A trend needs more; there is no trend yet.
const RECENT_ENTRY_LIMIT = 2;

export type SaveWeightGoalResult =
  | { kind: "saved"; view: WeightView }
  | { kind: "invalid"; reason: InvalidGoalReason };

export type LogWeightResult = { kind: "logged"; view: WeightView } | { kind: "invalid" };

interface GoalRow {
  mode: "target" | "hold";
  unit: WeightUnit;
  startWeightKg: string;
  startDate: string;
  targetWeightKg: string | null;
  rateKgPerWeek: string | null;
  holdBandKg: string | null;
  checkinIntervalDays: number;
}

// numeric arrives as a string - the column type protects stored precision, and
// this is the point of arithmetic where it becomes a number.
const toGoal = (row: GoalRow): WeightGoal => ({
  mode: row.mode,
  startWeightKg: Number(row.startWeightKg),
  startDate: row.startDate,
  targetWeightKg: row.targetWeightKg === null ? null : Number(row.targetWeightKg),
  rateKgPerWeek: row.rateKgPerWeek === null ? null : Number(row.rateKgPerWeek),
  holdBandKg: row.holdBandKg === null ? null : Number(row.holdBandKg),
  checkinIntervalDays: row.checkinIntervalDays,
});

const toEntry = (row: { measuredOn: string; weightKg: string }): WeightEntry => ({
  measuredOn: row.measuredOn,
  weightKg: Number(row.weightKg),
});

// Exported so getDayLog can pull the view alongside a day's totals without a
// second requireUserId() round trip - the same seam fetchCalorieGoal uses.
// No timezone parameter: the cadence is calendar arithmetic over stored local
// dates, and the only caller that needs "today" already has it.
export const fetchWeightView = async (userId: string): Promise<WeightView | null> => {
  const [goalRow] = await db
    .select({
      mode: weightGoals.mode,
      startWeightKg: weightGoals.startWeightKg,
      startDate: weightGoals.startDate,
      targetWeightKg: weightGoals.targetWeightKg,
      rateKgPerWeek: weightGoals.rateKgPerWeek,
      holdBandKg: weightGoals.holdBandKg,
      checkinIntervalDays: weightGoals.checkinIntervalDays,
      unit: users.weightUnit,
    })
    .from(weightGoals)
    // The display unit lives on the user row; joining it here keeps the view
    // one round trip, which is what lets it ride getDayLog's Promise.all.
    .innerJoin(users, eq(users.id, weightGoals.userId))
    .where(eq(weightGoals.userId, userId));

  if (!goalRow) return null;

  const entryRows = await db
    .select({ measuredOn: weightEntries.measuredOn, weightKg: weightEntries.weightKg })
    .from(weightEntries)
    .where(eq(weightEntries.userId, userId))
    .orderBy(desc(weightEntries.measuredOn))
    .limit(RECENT_ENTRY_LIMIT);

  const goal = toGoal(goalRow);
  const [latestRow, previousRow] = entryRows;
  const latest = latestRow ? toEntry(latestRow) : null;
  return {
    goal,
    unit: goalRow.unit,
    latest,
    previous: previousRow ? toEntry(previousRow) : null,
    nextCheckinDate: nextCheckinDate(goal, latest),
  };
};

// The thrown classes never leave this module: a Server Action's error reaches a
// client component as a plain Error with its subclass and message stripped, so
// the refusal travels as a result union instead. Same shape as
// CreateProductResult.
export const saveWeightGoal = async (
  input: WeightGoalInput,
  timezone: string,
): Promise<SaveWeightGoalResult> => {
  const userId = await requireUserId();
  const today = todayLocalDateString(timezone);
  try {
    const reason = weightGoalInputError(input);
    if (reason) throw new InvalidWeightGoalError(reason);

    // One transaction: a goal without the reading it started from would open
    // in no-entries state, and a unit change without its goal is a half-save.
    await db.transaction(async (tx) => {
      await writeWeightGoal(tx, userId, input, today);
      await upsertWeightEntry(tx, userId, today, input.currentWeightKg);
    });

    const view = await fetchWeightView(userId);
    if (!view) throw new InvalidWeightGoalError("weight");
    return { kind: "saved", view };
  } catch (error) {
    if (error instanceof InvalidWeightGoalError) {
      return { kind: "invalid", reason: weightGoalInputError(input) ?? "weight" };
    }
    throw error;
  }
};

export const logWeight = async (weightKg: number, timezone: string): Promise<LogWeightResult> => {
  const userId = await requireUserId();
  try {
    if (!isValidWeightKg(weightKg)) throw new InvalidWeightError(weightKg);
    await db.transaction((tx) => upsertWeightEntry(tx, userId, todayLocalDateString(timezone), weightKg));
    const view = await fetchWeightView(userId);
    if (!view) throw new InvalidWeightError(weightKg);
    return { kind: "logged", view };
  } catch (error) {
    if (error instanceof InvalidWeightError) return { kind: "invalid" };
    throw error;
  }
};

// Readings survive: they are measurements, not part of the goal that framed
// them, and a later goal reads the same history.
export const deleteWeightGoal = async (): Promise<void> => {
  const userId = await requireUserId();
  await db.delete(weightGoals).where(and(eq(weightGoals.userId, userId)));
};
