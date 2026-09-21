// app/src/app/(app)/day/[date]/weight-goal-sheet.test.ts
import { describe, expect, it, vi } from "vitest";

import { cadenceLabel, weightGoalInputError } from "@/features/weight/actions/weight.utils";

// The component imports the Server Action, whose chain reaches next-auth and
// its bare `next/server` specifier - which vitest cannot resolve, so this file
// collected as "0 test" and its cases never ran. Nothing here calls the
// action; only the pure draft functions beside it are under test.
vi.mock("@/features/weight/actions/weight", () => ({ saveWeightGoal: vi.fn() }));

import { draftToInput, type GoalDraft } from "./weight-goal-sheet";

const targetDraft: GoalDraft = {
  mode: "target",
  unit: "kg",
  currentDraft: "84.8",
  targetDraft: "72",
  paceDraft: "0.5",
  bandDraft: "1",
  recomp: false,
  cadenceDraft: "7",
};

describe("draftToInput", () => {
  it("builds a storable target input, dropping the band", () => {
    const input = draftToInput(targetDraft);
    expect(input).toEqual({
      mode: "target",
      unit: "kg",
      currentWeightKg: 84.8,
      targetWeightKg: 72,
      rateKgPerWeek: 0.5,
      holdBandKg: null,
      recomp: false,
      checkinIntervalDays: 7,
    });
    expect(weightGoalInputError(input)).toBeNull();
  });

  it("builds a hold input, dropping target and rate", () => {
    const input = draftToInput({ ...targetDraft, mode: "hold" });
    expect(input.targetWeightKg).toBeNull();
    expect(input.rateKgPerWeek).toBeNull();
    expect(input.holdBandKg).toBe(1);
    expect(weightGoalInputError(input)).toBeNull();
  });

  it("keeps recomp on a hold and drops it on a target", () => {
    expect(draftToInput({ ...targetDraft, mode: "hold", recomp: true }).recomp).toBe(true);
    expect(draftToInput({ ...targetDraft, recomp: true }).recomp).toBe(false);
  });

  it("reads a comma decimal", () => {
    expect(draftToInput({ ...targetDraft, currentDraft: "84,8" }).currentWeightKg).toBe(84.8);
  });

  it("surfaces an unusable target as a rejectable input rather than guessing", () => {
    expect(weightGoalInputError(draftToInput({ ...targetDraft, targetDraft: "" }))).toBe("target");
  });
});

describe("cadenceLabel", () => {
  it("names each preset the way the user chose it", () => {
    expect(cadenceLabel(1)).toBe("Daily");
    expect(cadenceLabel(7)).toBe("Weekly");
    expect(cadenceLabel(14)).toBe("2 weeks");
    expect(cadenceLabel(30)).toBe("Monthly");
  });
});

describe("a pound draft", () => {
  const poundDraft: GoalDraft = {
    mode: "target",
    unit: "lb",
    currentDraft: "187",
    targetDraft: "158.7",
    paceDraft: "1",
    bandDraft: "2",
    recomp: false,
    cadenceDraft: "2",
  };

  it("crosses to the action in kilograms, whatever was typed", () => {
    const input = draftToInput(poundDraft);
    expect(input.unit).toBe("lb");
    expect(input.currentWeightKg).toBeCloseTo(84.82, 2);
    expect(input.rateKgPerWeek).toBeCloseTo(0.45, 2);
    expect(input.checkinIntervalDays).toBe(2);
    expect(weightGoalInputError(input)).toBeNull();
  });
});

describe("a cadence and pace outside the presets", () => {
  it("is storable - the presets are shortcuts, not the range", () => {
    const input = draftToInput({ ...targetDraft, paceDraft: "1.6", cadenceDraft: "2" });
    expect(input.rateKgPerWeek).toBe(1.6);
    expect(weightGoalInputError(input)).toBeNull();
  });
});
