"use server";

import { and, eq } from "drizzle-orm";
import { refresh } from "next/cache";

import { requireUserId } from "@/lib/auth/require-user";
import { db } from "@/lib/db";
import { weightGoals } from "@/lib/db/schema";
import { todayLocalDateString } from "@/lib/date/day-bounds";

import { InvalidWeightError, InvalidWeightGoalError } from "./weight.errors";
import { fetchWeightView, upsertWeightEntry, writeWeightGoal } from "./weight.store";
import {
  isValidWeightKg,
  weightGoalInputError,
  type InvalidGoalReason,
  type WeightGoalInput,
  type WeightView,
} from "./weight.utils";

export type SaveWeightGoalResult =
  | { kind: "saved"; view: WeightView }
  | { kind: "invalid"; reason: InvalidGoalReason };

export type LogWeightResult = { kind: "logged"; view: WeightView } | { kind: "invalid" };

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
    refresh();
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
    refresh();
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
  refresh();
};
