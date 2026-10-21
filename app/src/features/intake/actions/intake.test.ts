import { randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { db } from "@/lib/db";
import { intakeProfiles, users, weightEntries, weightGoals } from "@/lib/db/schema";
import { todayLocalDateString } from "@/lib/date/day-bounds";

import { CONSENT_VERSION } from "./intake.utils";

const userId = randomUUID();

vi.mock("@/lib/auth/require-user", () => ({ requireUserId: () => Promise.resolve(userId) }));

const { forgetIntakeProfile, getIntakePrefill, saveIntakeEstimate } = await import("./intake");

const TIMEZONE = "Europe/Berlin";
const THIS_YEAR = Number(todayLocalDateString(TIMEZONE).slice(0, 4));

// Male, 30, 180 cm, 80 kg, Active, losing fat: 2319 kcal → goal 2320
// (worked in intake.utils.test.ts).
const baseInput = {
  unit: "kg" as const,
  sex: "male" as const,
  birthYear: THIS_YEAR - 30,
  heightCm: 180,
  weightKg: 80,
  activityLevel: "moderate" as const,
  primaryGoal: "lose_fat" as const,
  goalWeightKg: null,
  paceKgPerWeek: null,
  holdBandKg: null,
  recomp: false,
  bodyFatPct: null,
  bodyFatSource: null,
  trainingStyle: null,
  strengthDaysPerWeek: null,
  trainingYears: null,
  trackingPeriodDays: null,
  pregnantOrBreastfeeding: false,
  metabolismCondition: false,
  metabolismAdjustPct: null,
  currentIntakeKcal: null,
  weightTrend: null,
  weightTrendKgPerWeek: null,
  saveAnswers: false,
};

const calorieGoal = async (): Promise<number | null> => {
  const [row] = await db.select({ goal: users.dailyCalorieGoal }).from(users).where(eq(users.id, userId));
  return row.goal;
};

const profileRows = () => db.select().from(intakeProfiles).where(eq(intakeProfiles.userId, userId));
const entryRows = () => db.select().from(weightEntries).where(eq(weightEntries.userId, userId));

const clearUserData = async (): Promise<void> => {
  await db.delete(intakeProfiles).where(eq(intakeProfiles.userId, userId));
  await db.delete(weightEntries).where(eq(weightEntries.userId, userId));
  await db.delete(weightGoals).where(eq(weightGoals.userId, userId));
  await db.update(users).set({ dailyCalorieGoal: null, weightUnit: "kg" }).where(eq(users.id, userId));
};

beforeAll(async () => {
  await db.insert(users).values({ id: userId, email: `intake-actions-${userId}@test.local` });
});

beforeEach(clearUserData);

afterAll(async () => {
  await clearUserData();
  await db.delete(users).where(eq(users.id, userId));
});

describe("saveIntakeEstimate", () => {
  it("sets the calorie goal to the rounded estimate, recomputed on the server", async () => {
    expect(await saveIntakeEstimate(baseInput, TIMEZONE)).toEqual({ kind: "saved", calorieGoal: 2320 });
    expect(await calorieGoal()).toBe(2320);
  });

  it("stores no answers without consent", async () => {
    await saveIntakeEstimate(baseInput, TIMEZONE);
    expect(await profileRows()).toHaveLength(0);
  });

  it("stores the answers with consent, stamped with when and which wording", async () => {
    await saveIntakeEstimate({ ...baseInput, saveAnswers: true }, TIMEZONE);
    const [row] = await profileRows();
    expect(row.heightCm).toBe("180.0");
    expect(row.consentVersion).toBe(CONSENT_VERSION);
    expect(row.consentedAt).toBeInstanceOf(Date);
  });

  it("withdraws consent - and deletes the answers - when saved again unticked", async () => {
    await saveIntakeEstimate({ ...baseInput, saveAnswers: true }, TIMEZONE);
    await saveIntakeEstimate(baseInput, TIMEZONE);
    expect(await profileRows()).toHaveLength(0);
  });

  it("refuses under-18s and writes nothing", async () => {
    const result = await saveIntakeEstimate({ ...baseInput, birthYear: THIS_YEAR - 17, saveAnswers: true }, TIMEZONE);
    expect(result).toEqual({ kind: "refused", reason: "under_18" });
    expect(await calorieGoal()).toBeNull();
    expect(await profileRows()).toHaveLength(0);
  });

  it("returns a bad field as data and writes nothing", async () => {
    const result = await saveIntakeEstimate({ ...baseInput, goalWeightKg: 90 }, TIMEZONE);
    expect(result).toEqual({ kind: "invalid", field: "goal_direction" });
    expect(await calorieGoal()).toBeNull();
    expect(await entryRows()).toHaveLength(0);
  });

  it("logs a new weight as today's reading", async () => {
    await saveIntakeEstimate(baseInput, TIMEZONE);
    const rows = await entryRows();
    expect(rows).toHaveLength(1);
    expect(rows[0].measuredOn).toBe(todayLocalDateString(TIMEZONE));
    expect(rows[0].weightKg).toBe("80.00");
  });

  it("does not invent a reading when the weight is the last one, untouched", async () => {
    await db.insert(weightEntries).values({ userId, measuredOn: "2026-09-01", weightKg: "80.00" });
    await saveIntakeEstimate(baseInput, TIMEZONE);
    expect(await entryRows()).toHaveLength(1);
  });

  it("writes a target weight goal from a goal weight, at the pace in use", async () => {
    await saveIntakeEstimate(baseInput, TIMEZONE);
    expect(await db.select().from(weightGoals).where(eq(weightGoals.userId, userId))).toHaveLength(0);

    await saveIntakeEstimate({ ...baseInput, goalWeightKg: 72 }, TIMEZONE);
    const [goal] = await db.select().from(weightGoals).where(eq(weightGoals.userId, userId));
    expect(goal.mode).toBe("target");
    expect(goal.targetWeightKg).toBe("72.00");
    // the suggested 0.5% of 80 kg
    expect(goal.rateKgPerWeek).toBe("0.40");
    expect(goal.checkinIntervalDays).toBe(7);
  });

  it("leaves an unchanged goal alone, so its start survives a recalculation", async () => {
    await saveIntakeEstimate({ ...baseInput, goalWeightKg: 72 }, TIMEZONE);
    await db.update(weightGoals).set({ startDate: "2026-01-01" }).where(eq(weightGoals.userId, userId));

    await saveIntakeEstimate({ ...baseInput, goalWeightKg: 72 }, TIMEZONE);
    const [kept] = await db.select().from(weightGoals).where(eq(weightGoals.userId, userId));
    expect(kept.startDate).toBe("2026-01-01");

    await saveIntakeEstimate({ ...baseInput, goalWeightKg: 70 }, TIMEZONE);
    const [moved] = await db.select().from(weightGoals).where(eq(weightGoals.userId, userId));
    expect(moved.targetWeightKg).toBe("70.00");
    expect(moved.startDate).toBe(todayLocalDateString(TIMEZONE));
  });

  it("writes a hold goal with recomp from maintain, and a band of 0 leaves the goal alone", async () => {
    const maintain = { ...baseInput, primaryGoal: "maintain" as const };
    await saveIntakeEstimate({ ...baseInput, goalWeightKg: 72 }, TIMEZONE);

    await saveIntakeEstimate({ ...maintain, holdBandKg: null }, TIMEZONE);
    const [untouched] = await db.select().from(weightGoals).where(eq(weightGoals.userId, userId));
    expect(untouched.mode).toBe("target");

    await saveIntakeEstimate({ ...maintain, holdBandKg: 1, recomp: true }, TIMEZONE);
    const [hold] = await db.select().from(weightGoals).where(eq(weightGoals.userId, userId));
    expect(hold).toMatchObject({ mode: "hold", holdBandKg: "1.00", recomp: true, startWeightKg: "80.00" });
  });

  it("stores the unit the user typed in", async () => {
    await saveIntakeEstimate({ ...baseInput, unit: "lb" }, TIMEZONE);
    const [row] = await db.select({ unit: users.weightUnit }).from(users).where(eq(users.id, userId));
    expect(row.unit).toBe("lb");
  });
});

describe("getIntakePrefill", () => {
  it("is empty for a user who never answered", async () => {
    expect(await getIntakePrefill()).toEqual({
      unit: "kg",
      latestWeightKg: null,
      targetGoal: null,
      holdGoal: null,
      hasWeightGoal: false,
      profile: null,
    });
  });

  it("returns stored answers, the latest reading and the target goal", async () => {
    await saveIntakeEstimate(
      {
        ...baseInput,
        goalWeightKg: 72,
        saveAnswers: true,
        metabolismCondition: true,
        metabolismAdjustPct: -10,
      },
      TIMEZONE,
    );
    const prefill = await getIntakePrefill();
    expect(prefill.latestWeightKg).toBe(80);
    expect(prefill.targetGoal).toEqual({ targetWeightKg: 72, rateKgPerWeek: 0.4 });
    expect(prefill.hasWeightGoal).toBe(true);
    expect(prefill.profile).toMatchObject({ sex: "male", heightCm: 180, metabolismAdjustPct: -10 });
  });

  it("round-trips a typed intake and its trend", async () => {
    await saveIntakeEstimate(
      {
        ...baseInput,
        saveAnswers: true,
        currentIntakeKcal: 2400,
        weightTrend: "down",
        weightTrendKgPerWeek: 0.5,
      },
      TIMEZONE,
    );
    const prefill = await getIntakePrefill();
    expect(prefill.profile).toMatchObject({ currentIntakeKcal: 2400, weightTrend: "down", weightTrendKgPerWeek: 0.5 });
  });
});

describe("forgetIntakeProfile", () => {
  it("deletes the answers and keeps the calorie goal and readings", async () => {
    await saveIntakeEstimate({ ...baseInput, saveAnswers: true }, TIMEZONE);
    await forgetIntakeProfile();
    expect(await profileRows()).toHaveLength(0);
    expect(await calorieGoal()).toBe(2320);
    expect(await entryRows()).toHaveLength(1);
  });
});
