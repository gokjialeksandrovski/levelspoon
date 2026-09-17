"use server";

import { eq } from "drizzle-orm";

import { requireUserId } from "@/lib/auth/require-user";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";

import { InvalidCalorieGoalError } from "./goals.errors";
import { isValidCalorieGoal } from "./goals.utils";

// Exported (not just internal) so meals.ts can pull a goal alongside a day's
// totals without a second requireUserId() round trip - the caller already
// knows which user it's fetching for.
export const fetchCalorieGoal = async (userId: string): Promise<number | null> => {
  const [row] = await db.select({ dailyCalorieGoal: users.dailyCalorieGoal }).from(users).where(eq(users.id, userId));
  return row?.dailyCalorieGoal ?? null;
};

export const getCalorieGoal = async (): Promise<number | null> => {
  const userId = await requireUserId();
  return fetchCalorieGoal(userId);
};

export const setCalorieGoal = async (goal: number): Promise<void> => {
  if (!isValidCalorieGoal(goal)) {
    throw new InvalidCalorieGoalError(goal);
  }
  const userId = await requireUserId();
  await db.update(users).set({ dailyCalorieGoal: goal }).where(eq(users.id, userId));
};
