"use server";

import { eq } from "drizzle-orm";
import { refresh } from "next/cache";

import { requireUserId } from "@/lib/auth/require-user";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";

import { InvalidCalorieGoalError, InvalidMacroTargetsError } from "./goals.errors";
import { fetchCalorieGoal } from "./goals.store";
import { isValidCalorieGoal } from "./goals.utils";
import { isValidMacroTargets, type MacroTargets } from "./macro-targets.utils";

export const getCalorieGoal = async (): Promise<number | null> => {
  const userId = await requireUserId();
  return fetchCalorieGoal(userId);
};

const assertTargetsStorable = (goal: number | null, targets: MacroTargets): void => {
  if (!isValidMacroTargets(targets)) {
    throw new InvalidMacroTargetsError(targets, "not whole figures, or shares that do not fit the day");
  }
  if (targets.unit === "pct" && goal === null) {
    throw new InvalidMacroTargetsError(targets, "shares need a daily calorie goal");
  }
};

const targetColumns = (targets: MacroTargets | null) =>
  targets === null
    ? { macroTargetUnit: null, macroProtein: null, macroCarbs: null, macroFat: null }
    : {
        macroTargetUnit: targets.unit,
        macroProtein: targets.values.protein,
        macroCarbs: targets.values.carbs,
        macroFat: targets.values.fat,
      };

// One write for the sheet's one Save, so a failure never leaves a new goal
// beside the old targets. A null goal removes the kcal goal; null targets
// stop tracking every macro.
export const saveDailyGoals = async (goal: number | null, targets: MacroTargets | null): Promise<void> => {
  if (goal !== null && !isValidCalorieGoal(goal)) {
    throw new InvalidCalorieGoalError(goal);
  }
  if (targets !== null) {
    assertTargetsStorable(goal, targets);
  }
  const userId = await requireUserId();
  await db
    .update(users)
    .set({
      dailyCalorieGoal: goal,
      ...targetColumns(targets),
    })
    .where(eq(users.id, userId));
  refresh();
};
