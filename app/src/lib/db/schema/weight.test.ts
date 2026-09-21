import { randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { db } from "@/lib/db";
import { users, weightEntries, weightGoals } from "@/lib/db/schema";

const userId = randomUUID();

// drizzle wraps the pg error: its own message is the failed query, and the
// constraint name lives on the cause. Asserting on the message would pass for
// any failed insert, including one no constraint refused.
const violatedConstraint = async (insert: Promise<unknown>): Promise<string | undefined> => {
  try {
    await insert;
  } catch (error) {
    const cause = (error as { cause?: { constraint?: string } }).cause;
    return cause?.constraint;
  }
  return undefined;
};

beforeAll(async () => {
  await db.insert(users).values({ id: userId, email: `weight-${userId}@test.local` });
});

afterAll(async () => {
  await db.delete(weightEntries).where(eq(weightEntries.userId, userId));
  await db.delete(weightGoals).where(eq(weightGoals.userId, userId));
  await db.delete(users).where(eq(users.id, userId));
});

describe("weight_goals constraints", () => {
  it("stores a target goal", async () => {
    await db.insert(weightGoals).values({
      userId,
      mode: "target",
      startWeightKg: "84.8",
      startDate: "2026-09-01",
      targetWeightKg: "72.0",
      rateKgPerWeek: "0.50",
      checkinIntervalDays: 7,
    });
    const [row] = await db.select().from(weightGoals).where(eq(weightGoals.userId, userId));
    expect(row.targetWeightKg).toBe("72.00");
    expect(row.holdBandKg).toBeNull();
    await db.delete(weightGoals).where(eq(weightGoals.userId, userId));
  });

  it("refuses a target goal with no target weight", async () => {
    expect(
      await violatedConstraint(
        db.insert(weightGoals).values({
          userId,
          mode: "target",
          startWeightKg: "84.8",
          startDate: "2026-09-01",
          rateKgPerWeek: "0.50",
          checkinIntervalDays: 7,
        })
      ),
    ).toBe("weight_goals_mode_fields");
  });

  it("refuses a hold goal carrying a rate", async () => {
    expect(
      await violatedConstraint(
        db.insert(weightGoals).values({
          userId,
          mode: "hold",
          startWeightKg: "78.0",
          startDate: "2026-09-01",
          holdBandKg: "1.0",
          rateKgPerWeek: "0.50",
          checkinIntervalDays: 7,
        })
      ),
    ).toBe("weight_goals_mode_fields");
  });

  it("refuses a target equal to the start weight", async () => {
    expect(
      await violatedConstraint(
        db.insert(weightGoals).values({
          userId,
          mode: "target",
          startWeightKg: "78.0",
          startDate: "2026-09-01",
          targetWeightKg: "78.0",
          rateKgPerWeek: "0.50",
          checkinIntervalDays: 7,
        })
      ),
    ).toBe("weight_goals_target_differs");
  });

  it("refuses a cadence of zero days", async () => {
    expect(
      await violatedConstraint(
        db.insert(weightGoals).values({
          userId,
          mode: "target",
          startWeightKg: "84.8",
          startDate: "2026-09-01",
          targetWeightKg: "72.0",
          rateKgPerWeek: "0.50",
          checkinIntervalDays: 0,
        })
      ),
    ).toBe("weight_goals_checkin_interval_positive");
  });

  it("keeps a pound reading's own precision", async () => {
    // 172.7 lb is 78.33 kg. At the column's old single decimal it stored 78.3
    // and read back as 172.6 lb - a figure the user never typed.
    await db.insert(weightEntries).values({ userId, measuredOn: "2026-09-19", weightKg: "78.33" });
    const [row] = await db
      .select({ weightKg: weightEntries.weightKg })
      .from(weightEntries)
      .where(eq(weightEntries.userId, userId));
    expect(row.weightKg).toBe("78.33");
  });
});

describe("weight_entries", () => {
  it("keeps one reading per local day", async () => {
    await db.insert(weightEntries).values({ userId, measuredOn: "2026-09-21", weightKg: "78.4" });
    expect(
      await violatedConstraint(
        db.insert(weightEntries).values({ userId, measuredOn: "2026-09-21", weightKg: "78.9" })
      ),
    ).toBe("weight_entries_user_id_measured_on_unique");
    await db.delete(weightEntries).where(eq(weightEntries.userId, userId));
  });
});
