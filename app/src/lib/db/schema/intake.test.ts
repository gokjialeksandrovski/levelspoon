import { randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { db } from "@/lib/db";
import { intakeProfiles, users } from "@/lib/db/schema";

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

const validRow = {
  userId,
  sex: "male" as const,
  birthYear: 1996,
  heightCm: "180.0",
  activityLevel: "moderate" as const,
  primaryGoal: "lose_fat" as const,
  consentedAt: new Date(),
  consentVersion: 1,
};

beforeAll(async () => {
  await db.insert(users).values({ id: userId, email: `intake-schema-${userId}@test.local` });
});

afterAll(async () => {
  await db.delete(intakeProfiles).where(eq(intakeProfiles.userId, userId));
  await db.delete(users).where(eq(users.id, userId));
});

describe("intake_profiles", () => {
  it("stores a row with only the required answers", async () => {
    await db.insert(intakeProfiles).values(validRow);
    const [row] = await db.select().from(intakeProfiles).where(eq(intakeProfiles.userId, userId));
    expect(row.heightCm).toBe("180.0");
    expect(row.metabolismCondition).toBe(false);
    await db.delete(intakeProfiles).where(eq(intakeProfiles.userId, userId));
  });

  it("refuses a metabolism figure without the condition ticked", async () => {
    expect(
      await violatedConstraint(db.insert(intakeProfiles).values({ ...validRow, metabolismAdjustPct: 10 })),
    ).toBe("intake_metabolism_pct");
  });

  it("refuses a metabolism figure past ±30%", async () => {
    expect(
      await violatedConstraint(
        db.insert(intakeProfiles).values({ ...validRow, metabolismCondition: true, metabolismAdjustPct: -31 }),
      ),
    ).toBe("intake_metabolism_pct");
  });

  it("refuses a zero metabolism figure - zero is no figure, stored as null", async () => {
    expect(
      await violatedConstraint(
        db.insert(intakeProfiles).values({ ...validRow, metabolismCondition: true, metabolismAdjustPct: 0 }),
      ),
    ).toBe("intake_metabolism_pct");
  });

  it("refuses a body-fat figure without its source", async () => {
    expect(await violatedConstraint(db.insert(intakeProfiles).values({ ...validRow, bodyFatPct: "20.0" }))).toBe(
      "intake_body_fat_pair",
    );
  });

  it("refuses more than seven strength days a week", async () => {
    expect(await violatedConstraint(db.insert(intakeProfiles).values({ ...validRow, strengthDaysPerWeek: 8 }))).toBe(
      "intake_strength_days",
    );
  });

  it("goes when its user goes", async () => {
    const otherId = randomUUID();
    await db.insert(users).values({ id: otherId, email: `intake-cascade-${otherId}@test.local` });
    await db.insert(intakeProfiles).values({ ...validRow, userId: otherId });
    await db.delete(users).where(eq(users.id, otherId));
    const rows = await db.select().from(intakeProfiles).where(eq(intakeProfiles.userId, otherId));
    expect(rows).toHaveLength(0);
  });
});
