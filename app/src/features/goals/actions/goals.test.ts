import { eq, sql } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockAuth = vi.fn();
vi.mock("@/auth", () => ({ auth: () => mockAuth() }));

import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";

import { fetchCalorieGoal, getCalorieGoal, setCalorieGoal } from "./goals";
import { InvalidCalorieGoalError } from "./goals.errors";
import { MAX_CALORIE_GOAL, MIN_CALORIE_GOAL } from "./goals.utils";

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

describe("setCalorieGoal", () => {
  it("stores a valid goal for the authenticated user", async () => {
    const userId = await seedUser();
    mockAuth.mockResolvedValue({ user: { id: userId } });

    await setCalorieGoal(2400);

    const [row] = await db.select({ goal: users.dailyCalorieGoal }).from(users).where(eq(users.id, userId));
    expect(row.goal).toBe(2400);
  });

  it("rejects a goal below the minimum", async () => {
    const userId = await seedUser();
    mockAuth.mockResolvedValue({ user: { id: userId } });

    await expect(setCalorieGoal(MIN_CALORIE_GOAL - 1)).rejects.toThrow(InvalidCalorieGoalError);
  });

  it("rejects a goal above the maximum", async () => {
    const userId = await seedUser();
    mockAuth.mockResolvedValue({ user: { id: userId } });

    await expect(setCalorieGoal(MAX_CALORIE_GOAL + 1)).rejects.toThrow(InvalidCalorieGoalError);
  });

  it("rejects a non-integer goal", async () => {
    const userId = await seedUser();
    mockAuth.mockResolvedValue({ user: { id: userId } });

    await expect(setCalorieGoal(2000.5)).rejects.toThrow(InvalidCalorieGoalError);
  });
});
