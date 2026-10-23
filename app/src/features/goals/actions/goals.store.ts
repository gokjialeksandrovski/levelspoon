// No "use server": every export takes a userId, and as a Server Action that
// would let a browser read any user's goals. Same seam as weight.store.ts.
import { eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";

import type { MacroTargets } from "./macro-targets.utils";

export const fetchCalorieGoal = async (userId: string): Promise<number | null> => {
  const [row] = await db.select({ dailyCalorieGoal: users.dailyCalorieGoal }).from(users).where(eq(users.id, userId));
  return row?.dailyCalorieGoal ?? null;
};

// The unit CHECK guarantees a unit exactly when some macro is tracked.
export const fetchMacroTargets = async (userId: string): Promise<MacroTargets | null> => {
  const [row] = await db
    .select({ unit: users.macroTargetUnit, protein: users.macroProtein, carbs: users.macroCarbs, fat: users.macroFat })
    .from(users)
    .where(eq(users.id, userId));
  if (!row || row.unit === null) return null;
  return { unit: row.unit, values: { protein: row.protein, carbs: row.carbs, fat: row.fat } };
};
