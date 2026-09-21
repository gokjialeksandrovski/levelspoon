// app/src/app/(app)/day/[date]/weight-goal-sheet.test.ts
import { describe, expect, it } from "vitest";

import { weightGoalInputError } from "@/features/weight/actions/weight.utils";

import { cadenceLabel, draftToInput, type GoalDraft } from "./weight-goal-sheet";

const targetDraft: GoalDraft = {
  mode: "target",
  currentDraft: "84.8",
  targetDraft: "72",
  rateKgPerWeek: 0.5,
  bandKg: 1,
  checkinIntervalDays: 7,
};

describe("draftToInput", () => {
  it("builds a storable target input, dropping the band", () => {
    const input = draftToInput(targetDraft);
    expect(input).toEqual({
      mode: "target",
      currentWeightKg: 84.8,
      targetWeightKg: 72,
      rateKgPerWeek: 0.5,
      holdBandKg: null,
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

  it("reads a comma decimal", () => {
    expect(draftToInput({ ...targetDraft, currentDraft: "84,8" }).currentWeightKg).toBe(84.8);
  });

  it("surfaces an unusable target as a rejectable input rather than guessing", () => {
    expect(weightGoalInputError(draftToInput({ ...targetDraft, targetDraft: "" }))).toBe("target");
  });
});

describe("cadenceLabel", () => {
  it("names each interval the way the user chose it", () => {
    expect(cadenceLabel(7)).toBe("Weekly");
    expect(cadenceLabel(14)).toBe("2 weeks");
    expect(cadenceLabel(30)).toBe("Monthly");
  });
});
