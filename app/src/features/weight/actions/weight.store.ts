// No "use server": every export takes a userId, and as a Server Action that
// would let a browser write any user's rows. Only "use server" modules import
// this file (CLAUDE.md, "Server/client boundary"); they resolve the user
// themselves and hand it in.
import { and, desc, eq, gte, lte } from "drizzle-orm";

import { startRecompProtein } from "@/features/goals/actions/macro-targets.store";
import { db, type DbTransaction } from "@/lib/db";
import { users, weightEntries, weightGoals } from "@/lib/db/schema";

import {
  nextCheckinDate,
  roundToHundredth,
  type WeightEntry,
  type WeightGoal,
  type WeightGoalInput,
  type WeightUnit,
  type WeightView,
} from "./weight.utils";

// numeric(6,2) / numeric(4,2): the scale every stored kg figure is written at.
const STORED_DECIMALS = 2;

const toStoredKg = (weightKg: number): string => roundToHundredth(weightKg).toFixed(STORED_DECIMALS);

const toStoredOrNull = (weightKg: number | null): string | null =>
  weightKg === null ? null : toStoredKg(weightKg);

export const upsertWeightEntry = async (
  tx: DbTransaction,
  userId: string,
  measuredOn: string,
  weightKg: number,
): Promise<void> => {
  const value = toStoredKg(weightKg);
  await tx
    .insert(weightEntries)
    .values({ userId, measuredOn, weightKg: value })
    .onConflictDoUpdate({
      target: [weightEntries.userId, weightEntries.measuredOn],
      set: { weightKg: value },
    });
};

// Assumes weightGoalInputError(input) already returned null - each caller owns
// its own refusal copy. A re-save replaces the goal in place: one goal per
// user, and the new origin is the weight just entered.
export const writeWeightGoal = async (
  tx: DbTransaction,
  userId: string,
  input: WeightGoalInput,
  today: string,
): Promise<void> => {
  const row = {
    userId,
    mode: input.mode,
    startWeightKg: toStoredKg(input.currentWeightKg),
    startDate: today,
    targetWeightKg: toStoredOrNull(input.targetWeightKg),
    rateKgPerWeek: toStoredOrNull(input.rateKgPerWeek),
    holdBandKg: toStoredOrNull(input.holdBandKg),
    recomp: input.recomp,
    checkinIntervalDays: input.checkinIntervalDays,
    updatedAt: new Date(),
  };
  // The unit is a user preference, so it survives the goal being deleted and
  // still names the unit the surviving readings are read in.
  await tx.update(users).set({ weightUnit: input.unit }).where(eq(users.id, userId));
  await tx.insert(weightGoals).values(row).onConflictDoUpdate({ target: weightGoals.userId, set: row });
  // The one figure this feature hands to goals, and it travels in grams of
  // body weight, never in calories: recomp is the one goal that asks for a
  // protein target, and both save paths for it pass through here.
  if (input.recomp) await startRecompProtein(tx, userId, input.currentWeightKg);
};

export const fetchLatestWeightKg = async (userId: string): Promise<number | null> => {
  const [row] = await db
    .select({ weightKg: weightEntries.weightKg })
    .from(weightEntries)
    .where(eq(weightEntries.userId, userId))
    .orderBy(desc(weightEntries.measuredOn))
    .limit(1);
  return row ? Number(row.weightKg) : null;
};

/** Every reading from `from` to `to` inclusive, oldest first. */
export const fetchWeightReadings = async (
  userId: string,
  from: string,
  to: string,
): Promise<{ date: string; weightKg: number }[]> => {
  const rows = await db
    .select({ measuredOn: weightEntries.measuredOn, weightKg: weightEntries.weightKg })
    .from(weightEntries)
    .where(
      and(
        eq(weightEntries.userId, userId),
        gte(weightEntries.measuredOn, from),
        lte(weightEntries.measuredOn, to),
      ),
    )
    .orderBy(weightEntries.measuredOn);
  // numeric arrives as a string; this is the point of arithmetic.
  return rows.map((row) => ({ date: row.measuredOn, weightKg: Number(row.weightKg) }));
};

// Two rows: the reading on screen and the one before it, which is all the
// panel's "last change" line needs. A trend needs more; there is no trend yet.
const RECENT_ENTRY_LIMIT = 2;

interface GoalRow {
  mode: "target" | "hold";
  unit: WeightUnit;
  startWeightKg: string;
  startDate: string;
  targetWeightKg: string | null;
  rateKgPerWeek: string | null;
  holdBandKg: string | null;
  recomp: boolean;
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
  recomp: row.recomp,
  checkinIntervalDays: row.checkinIntervalDays,
});

const toEntry = (row: { measuredOn: string; weightKg: string }): WeightEntry => ({
  measuredOn: row.measuredOn,
  weightKg: Number(row.weightKg),
});

// No timezone parameter: the cadence is calendar arithmetic over stored local
// dates, and the only caller that needs "today" already has it.
export const fetchWeightView = async (userId: string): Promise<WeightView | null> => {
  // Both reads key on userId alone, so they run together; the entries go
  // unused when there is no goal, which costs one indexed read.
  const [[goalRow], entryRows] = await Promise.all([
    db
      .select({
        mode: weightGoals.mode,
        startWeightKg: weightGoals.startWeightKg,
        startDate: weightGoals.startDate,
        targetWeightKg: weightGoals.targetWeightKg,
        rateKgPerWeek: weightGoals.rateKgPerWeek,
        holdBandKg: weightGoals.holdBandKg,
        recomp: weightGoals.recomp,
        checkinIntervalDays: weightGoals.checkinIntervalDays,
        unit: users.weightUnit,
      })
      .from(weightGoals)
      // The display unit lives on the user row; joining it here keeps the view
      // one round trip, which is what lets it ride getDayLog's Promise.all.
      .innerJoin(users, eq(users.id, weightGoals.userId))
      .where(eq(weightGoals.userId, userId)),
    db
      .select({ measuredOn: weightEntries.measuredOn, weightKg: weightEntries.weightKg })
      .from(weightEntries)
      .where(eq(weightEntries.userId, userId))
      .orderBy(desc(weightEntries.measuredOn))
      .limit(RECENT_ENTRY_LIMIT),
  ]);

  if (!goalRow) return null;

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
