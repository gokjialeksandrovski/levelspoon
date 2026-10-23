import { eq, sql } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockAuth = vi.fn();
vi.mock("@/auth", () => ({ auth: () => mockAuth() }));

import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";

import { getCalorieGoal, saveDailyGoals } from "./goals";
import { fetchCalorieGoal, fetchMacroTargets } from "./goals.store";
import { InvalidCalorieGoalError, InvalidMacroTargetsError } from "./goals.errors";
import { GOAL_STORAGE_CEILING, MIN_CALORIE_GOAL } from "./goals.utils";

const seedUser = async (): Promise<string> => {
  const [user] = await db.insert(users).values({ email: `t-${crypto.randomUUID()}@example.com` }).returning();
  return user.id;
};

beforeEach(async () => {
  await db.execute(sql`TRUNCATE TABLE "user" CASCADE`);
  mockAuth.mockReset();
});

describe("fetchCalorieGoal", () => {
  it("returns null before any goal is set", async () => {
    const userId = await seedUser();
    expect(await fetchCalorieGoal(userId)).toBeNull();
  });

  it("returns the stored goal", async () => {
    const userId = await seedUser();
    await db.update(users).set({ dailyCalorieGoal: 2200 }).where(eq(users.id, userId));
    expect(await fetchCalorieGoal(userId)).toBe(2200);
  });
});

describe("getCalorieGoal", () => {
  it("reads the authenticated user's own goal", async () => {
    const userId = await seedUser();
    await db.update(users).set({ dailyCalorieGoal: 1800 }).where(eq(users.id, userId));
    mockAuth.mockResolvedValue({ user: { id: userId } });

    expect(await getCalorieGoal()).toBe(1800);
  });
});

describe("saveDailyGoals", () => {
  it("stores a valid goal for the authenticated user", async () => {
    const userId = await seedUser();
    mockAuth.mockResolvedValue({ user: { id: userId } });

    await saveDailyGoals(2400, null);

    const [row] = await db.select({ goal: users.dailyCalorieGoal }).from(users).where(eq(users.id, userId));
    expect(row.goal).toBe(2400);
  });

  it("rejects zero and below - no target, a slipped keystroke", async () => {
    const userId = await seedUser();
    mockAuth.mockResolvedValue({ user: { id: userId } });

    await expect(saveDailyGoals(MIN_CALORIE_GOAL - 1, null)).rejects.toThrow(InvalidCalorieGoalError);
  });

  it("rejects a goal past what the column can store", async () => {
    const userId = await seedUser();
    mockAuth.mockResolvedValue({ user: { id: userId } });

    await expect(saveDailyGoals(GOAL_STORAGE_CEILING + 1, null)).rejects.toThrow(InvalidCalorieGoalError);
  });

  it("saves a contest-prep target the old floor would have refused", async () => {
    const userId = await seedUser();
    mockAuth.mockResolvedValue({ user: { id: userId } });

    await saveDailyGoals(900, null);

    expect(await getCalorieGoal()).toBe(900);
  });

  it("rejects a non-integer goal", async () => {
    const userId = await seedUser();
    mockAuth.mockResolvedValue({ user: { id: userId } });

    await expect(saveDailyGoals(2000.5, null)).rejects.toThrow(InvalidCalorieGoalError);
  });
});

describe("saveDailyGoals macro targets", () => {
  const pct30_40_30 = { unit: "pct" as const, values: { protein: 30, carbs: 40, fat: 30 } };
  const proteinOnlyGrams = { unit: "g" as const, values: { protein: 150, carbs: null, fat: null } };

  it("stores targets beside the goal and reads them back", async () => {
    const userId = await seedUser();
    mockAuth.mockResolvedValue({ user: { id: userId } });

    await saveDailyGoals(2100, pct30_40_30);

    expect(await fetchMacroTargets(userId)).toEqual(pct30_40_30);
    expect(await fetchCalorieGoal(userId)).toBe(2100);
  });

  it("stores gram targets with no kcal goal, and removes a goal that was set", async () => {
    const userId = await seedUser();
    mockAuth.mockResolvedValue({ user: { id: userId } });

    await saveDailyGoals(2100, null);
    await saveDailyGoals(null, proteinOnlyGrams);

    expect(await fetchMacroTargets(userId)).toEqual(proteinOnlyGrams);
    expect(await fetchCalorieGoal(userId)).toBeNull();
  });

  it("clears the targets when saved with null", async () => {
    const userId = await seedUser();
    mockAuth.mockResolvedValue({ user: { id: userId } });

    await saveDailyGoals(2100, pct30_40_30);
    await saveDailyGoals(2100, null);

    expect(await fetchMacroTargets(userId)).toBeNull();
  });

  it("refuses shares with no kcal goal and writes nothing", async () => {
    const userId = await seedUser();
    mockAuth.mockResolvedValue({ user: { id: userId } });
    await saveDailyGoals(2100, null);

    await expect(saveDailyGoals(null, pct30_40_30)).rejects.toThrow(InvalidMacroTargetsError);
    expect(await fetchCalorieGoal(userId)).toBe(2100);
  });

  it("refuses three shares that do not fill the day", async () => {
    const userId = await seedUser();
    mockAuth.mockResolvedValue({ user: { id: userId } });

    await expect(
      saveDailyGoals(2100, { unit: "pct", values: { protein: 30, carbs: 40, fat: 25 } }),
    ).rejects.toThrow(InvalidMacroTargetsError);
  });

  it("is refused by the columns too, not only the action", async () => {
    const userId = await seedUser();
    const update = (values: Partial<typeof users.$inferInsert>) => db.update(users).set(values).where(eq(users.id, userId));

    await expect(update({ macroProtein: 30 })).rejects.toThrow();
    await expect(update({ macroTargetUnit: "pct", macroProtein: 30 })).rejects.toThrow();
    await expect(
      update({ dailyCalorieGoal: 2000, macroTargetUnit: "pct", macroProtein: 60, macroFat: 50 }),
    ).rejects.toThrow();
    await expect(update({ macroTargetUnit: "g", macroProtein: 30000, macroCarbs: 30000 })).resolves.toBeDefined();
  });
});
