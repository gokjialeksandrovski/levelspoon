// app/src/features/meals/actions/meals.weight.test.ts
import { randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { db } from "@/lib/db";
import { users, weightEntries, weightGoals } from "@/lib/db/schema";
import { todayLocalDateString } from "@/lib/date/day-bounds";

const userId = randomUUID();
const TIMEZONE = "Europe/Berlin";

vi.mock("@/lib/auth/require-user", () => ({ requireUserId: () => Promise.resolve(userId) }));

const { getDayLog } = await import("./meals");
const { saveWeightGoal } = await import("@/features/weight/actions/weight");

beforeAll(async () => {
  await db.insert(users).values({ id: userId, email: `day-weight-${userId}@test.local` });
});

afterAll(async () => {
  await db.delete(weightEntries).where(eq(weightEntries.userId, userId));
  await db.delete(weightGoals).where(eq(weightGoals.userId, userId));
  await db.delete(users).where(eq(users.id, userId));
});

describe("getDayLog weight", () => {
  it("is null with no goal", async () => {
    const log = await getDayLog(todayLocalDateString(TIMEZONE), TIMEZONE);
    expect(log.weight).toBeNull();
  });

  it("carries the view on today", async () => {
    await saveWeightGoal(
      { mode: "target", unit: "kg", currentWeightKg: 84.8, targetWeightKg: 72, rateKgPerWeek: 0.5, holdBandKg: null, checkinIntervalDays: 7 },
      TIMEZONE,
    );
    const log = await getDayLog(todayLocalDateString(TIMEZONE), TIMEZONE);
    expect(log.weight?.goal.targetWeightKg).toBe(72);
  });

  it("is null on a past day - a passed day cannot be weighed", async () => {
    const log = await getDayLog("2026-01-05", TIMEZONE);
    expect(log.weight).toBeNull();
  });
});
