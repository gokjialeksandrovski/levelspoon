import { randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { db } from "@/lib/db";
import { users, weightEntries, weightGoals } from "@/lib/db/schema";

const userId = randomUUID();

vi.mock("@/lib/auth/require-user", () => ({ requireUserId: () => Promise.resolve(userId) }));

const { deleteWeightGoal, logWeight, saveWeightGoal } = await import("./weight");
const { fetchWeightView } = await import("./weight.store");

const TIMEZONE = "Europe/Berlin";

const targetInput = {
  mode: "target" as const,
  unit: "kg" as const,
  currentWeightKg: 84.8,
  targetWeightKg: 72,
  rateKgPerWeek: 0.5,
  holdBandKg: null,
  recomp: false,
  checkinIntervalDays: 7,
};

beforeAll(async () => {
  await db.insert(users).values({ id: userId, email: `weight-actions-${userId}@test.local` });
});

const NO_TARGETS = { macroTargetUnit: null, macroProtein: null, macroCarbs: null, macroFat: null };

beforeEach(async () => {
  await db.delete(weightEntries).where(eq(weightEntries.userId, userId));
  await db.delete(weightGoals).where(eq(weightGoals.userId, userId));
  await db.update(users).set(NO_TARGETS).where(eq(users.id, userId));
});

afterAll(async () => {
  await db.delete(weightEntries).where(eq(weightEntries.userId, userId));
  await db.delete(weightGoals).where(eq(weightGoals.userId, userId));
  await db.delete(users).where(eq(users.id, userId));
});

describe("saveWeightGoal", () => {
  it("stores the goal and today's reading together", async () => {
    const result = await saveWeightGoal(targetInput, TIMEZONE);
    expect(result.kind).toBe("saved");
    if (result.kind !== "saved") return;
    expect(result.view.goal.targetWeightKg).toBe(72);
    expect(result.view.goal.startWeightKg).toBe(84.8);
    // Saving the current weight also logs it, so a fresh goal is never in
    // no-entries state for no reason.
    expect(result.view.latest?.weightKg).toBe(84.8);
    expect(result.view.nextCheckinDate).toBe(
      new Date(Date.parse(`${result.view.latest?.measuredOn}T00:00:00Z`) + 7 * 86_400_000)
        .toISOString()
        .slice(0, 10),
    );
  });

  it("returns the offending field as data, never a throw", async () => {
    const result = await saveWeightGoal({ ...targetInput, rateKgPerWeek: 0 }, TIMEZONE);
    expect(result).toEqual({ kind: "invalid", reason: "rate" });
    expect(await fetchWeightView(userId)).toBeNull();
  });

  it("replaces an existing goal and resets its origin to the new weight", async () => {
    await saveWeightGoal(targetInput, TIMEZONE);
    const result = await saveWeightGoal({ ...targetInput, currentWeightKg: 79.2 }, TIMEZONE);
    expect(result.kind).toBe("saved");
    if (result.kind !== "saved") return;
    expect(result.view.goal.startWeightKg).toBe(79.2);
    const rows = await db.select().from(weightGoals).where(eq(weightGoals.userId, userId));
    expect(rows).toHaveLength(1);
  });

  it("stores a hold goal with its band and no rate", async () => {
    const result = await saveWeightGoal(
      { mode: "hold", unit: "kg", currentWeightKg: 78, targetWeightKg: null, rateKgPerWeek: null, holdBandKg: 1, recomp: true, checkinIntervalDays: 14 },
      TIMEZONE,
    );
    expect(result.kind).toBe("saved");
    if (result.kind !== "saved") return;
    expect(result.view.goal.holdBandKg).toBe(1);
    expect(result.view.goal.recomp).toBe(true);
    expect(result.view.goal.rateKgPerWeek).toBeNull();
  });

  // 78 kg at 1.8 g/kg. Grams, so the target stands with or without a kcal goal.
  it("starts a protein target from recomp, and leaves targets the user already set", async () => {
    await saveWeightGoal({ mode: "hold" as const, unit: "kg" as const, currentWeightKg: 78, targetWeightKg: null, rateKgPerWeek: null, holdBandKg: 1, recomp: true, checkinIntervalDays: 14 }, TIMEZONE);
    const [started] = await db.select().from(users).where(eq(users.id, userId));
    expect(started).toMatchObject({ macroTargetUnit: "g", macroProtein: 140, macroCarbs: null });

    await db.update(users).set({ macroTargetUnit: "g", macroProtein: 200 }).where(eq(users.id, userId));
    await saveWeightGoal({ mode: "hold" as const, unit: "kg" as const, currentWeightKg: 78, targetWeightKg: null, rateKgPerWeek: null, holdBandKg: 1, recomp: true, checkinIntervalDays: 14 }, TIMEZONE);
    const [kept] = await db.select().from(users).where(eq(users.id, userId));
    expect(kept.macroProtein).toBe(200);
  });
});

describe("logWeight", () => {
  it("records a reading and moves the next check-in along", async () => {
    await saveWeightGoal(targetInput, TIMEZONE);
    const result = await logWeight(78.4, TIMEZONE);
    expect(result.kind).toBe("logged");
    if (result.kind !== "logged") return;
    expect(result.view.latest?.weightKg).toBe(78.4);
  });

  it("replaces the same day's reading rather than adding a second", async () => {
    await saveWeightGoal(targetInput, TIMEZONE);
    await logWeight(78.4, TIMEZONE);
    await logWeight(78.9, TIMEZONE);
    const rows = await db.select().from(weightEntries).where(eq(weightEntries.userId, userId));
    expect(rows).toHaveLength(1);
    expect(rows[0].weightKg).toBe("78.90");
  });

  it("refuses an implausible reading as data", async () => {
    await saveWeightGoal(targetInput, TIMEZONE);
    expect(await logWeight(4, TIMEZONE)).toEqual({ kind: "invalid" });
  });
});

describe("fetchWeightView", () => {
  it("is null with no goal", async () => {
    expect(await fetchWeightView(userId)).toBeNull();
  });

  it("carries the two most recent readings, newest first", async () => {
    await saveWeightGoal(targetInput, TIMEZONE);
    await db.delete(weightEntries).where(eq(weightEntries.userId, userId));
    await db.insert(weightEntries).values([
      { userId, measuredOn: "2026-09-07", weightKg: "84.8" },
      { userId, measuredOn: "2026-09-14", weightKg: "78.7" },
      { userId, measuredOn: "2026-09-21", weightKg: "78.4" },
    ]);
    const view = await fetchWeightView(userId);
    expect(view?.latest).toEqual({ measuredOn: "2026-09-21", weightKg: 78.4 });
    expect(view?.previous).toEqual({ measuredOn: "2026-09-14", weightKg: 78.7 });
  });
});

describe("deleteWeightGoal", () => {
  it("removes the goal and keeps the readings", async () => {
    await saveWeightGoal(targetInput, TIMEZONE);
    await deleteWeightGoal();
    expect(await fetchWeightView(userId)).toBeNull();
    const rows = await db.select().from(weightEntries).where(eq(weightEntries.userId, userId));
    expect(rows).toHaveLength(1);
  });
});
