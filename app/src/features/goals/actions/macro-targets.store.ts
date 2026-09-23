// No "use server": every export takes a userId, and as a Server Action that
// would let a browser write any user's rows. Same seam as weight.store.ts.
import { eq } from "drizzle-orm";

import { type DbTransaction } from "@/lib/db";
import { users } from "@/lib/db/schema";

import { recompProteinGrams } from "./macro-targets.utils";

// Grams, not a share of the kcal goal: 1.8 g per kg is what the recomp copy
// promises, and grams stay valid with or without a kcal goal.
const RECOMP_TARGET_UNIT = "g" as const;

// Ticking recomp starts a protein target; it never overwrites one. A user who
// has already set macros has said what they want, and the copy only promises
// a starting figure.
export const startRecompProtein = async (tx: DbTransaction, userId: string, weightKg: number): Promise<void> => {
  const [row] = await tx.select({ unit: users.macroTargetUnit }).from(users).where(eq(users.id, userId));
  if (!row || row.unit !== null) return;
  await tx
    .update(users)
    .set({ macroTargetUnit: RECOMP_TARGET_UNIT, macroProtein: recompProteinGrams(weightKg) })
    .where(eq(users.id, userId));
};
