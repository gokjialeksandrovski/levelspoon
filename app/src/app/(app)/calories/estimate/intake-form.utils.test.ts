import { describe, expect, it } from "vitest";

import {
  barStateOf,
  convertUnit,
  detailLines,
  draftToInput,
  initialDraft,
  missingRequiredCount,
  noticeLines,
  rangeText,
  applyButtonText,
  timelineText,
  type IntakeDraft,
} from "./intake-form.utils";

const CURRENT_YEAR = 2026;

const empty = initialDraft({ unit: "kg", latestWeightKg: null, targetGoal: null, hasWeightGoal: false, profile: null });

// The worked case from intake.utils.test.ts: 2087.1–2550.9, point 2319.
const caseA: IntakeDraft = {
  ...empty,
  sex: "male",
  birthYearDraft: "1996",
  heightCmDraft: "180",
  weightDraft: "80",
  activityLevel: "moderate",
  primaryGoal: "lose_fat",
};

const readyEstimate = (draft: IntakeDraft) => {
  const state = barStateOf(draft, CURRENT_YEAR);
  if (state.kind !== "ready") throw new Error(`expected ready, got ${state.kind}`);
  return state.estimate;
};

describe("missingRequiredCount and barStateOf", () => {
  it("counts all six required answers on an empty form", () => {
    expect(missingRequiredCount(empty)).toBe(6);
    expect(barStateOf(empty, CURRENT_YEAR)).toEqual({ kind: "incomplete", missing: 6 });
  });

  it("is ready once the six are in", () => {
    expect(missingRequiredCount(caseA)).toBe(0);
    expect(barStateOf(caseA, CURRENT_YEAR).kind).toBe("ready");
  });

  it("names the field that disagrees with the goal", () => {
    expect(barStateOf({ ...caseA, goalWeightDraft: "90" }, CURRENT_YEAR)).toEqual({
      kind: "invalid",
      field: "goal_direction",
    });
  });

  it("refuses under-18s", () => {
    expect(barStateOf({ ...caseA, birthYearDraft: "2010" }, CURRENT_YEAR)).toEqual({
      kind: "refused",
      reason: "under_18",
    });
  });
});

describe("draftToInput", () => {
  it("returns null until the required answers are in", () => {
    expect(draftToInput(empty)).toBeNull();
  });

  it("builds a save input in kg", () => {
    expect(draftToInput(caseA)).toMatchObject({
      unit: "kg",
      sex: "male",
      birthYear: 1996,
      heightCm: 180,
      weightKg: 80,
      goalWeightKg: null,
      paceKgPerWeek: null,
      bodyFatPct: null,
      bodyFatSource: null,
      saveAnswers: false,
      trackAsWeightGoal: false,
    });
  });

  it("drops goal weight and pace for maintain", () => {
    const input = draftToInput({ ...caseA, primaryGoal: "maintain", goalWeightDraft: "72", paceDraft: "0.5" });
    expect(input?.goalWeightKg).toBeNull();
    expect(input?.paceKgPerWeek).toBeNull();
  });

  it("turns a visual stage into its midpoint", () => {
    expect(draftToInput({ ...caseA, bodyFatStage: "soft" })).toMatchObject({ bodyFatPct: 20, bodyFatSource: "visual" });
  });

  it("signs the metabolism figure by direction", () => {
    const input = draftToInput({ ...caseA, metabolismCondition: true, metabolismDirection: "down", metabolismPctDraft: "10" });
    expect(input?.metabolismAdjustPct).toBe(-10);
  });

  it("drops a metabolism figure when the box is unticked", () => {
    expect(draftToInput({ ...caseA, metabolismPctDraft: "10" })?.metabolismAdjustPct).toBeNull();
  });

  it("never sends pregnancy for a male answer", () => {
    expect(draftToInput({ ...caseA, pregnantOrBreastfeeding: true })?.pregnantOrBreastfeeding).toBe(false);
  });

  it("tracks as a weight goal only with a goal weight", () => {
    expect(draftToInput({ ...caseA, trackAsWeightGoal: true })?.trackAsWeightGoal).toBe(false);
    expect(draftToInput({ ...caseA, trackAsWeightGoal: true, goalWeightDraft: "72" })?.trackAsWeightGoal).toBe(true);
  });
});

describe("convertUnit", () => {
  it("re-expresses weight and height in pounds and feet", () => {
    const lb = convertUnit(caseA, "lb");
    expect(lb.weightDraft).toBe("176.4");
    expect(lb.heightFtDraft).toBe("5");
    expect(lb.heightInDraft).toBe("11");
    expect(draftToInput(lb)?.heightCm).toBe(180.3);
  });

  it("comes back to kilograms", () => {
    const kg = convertUnit(convertUnit(caseA, "lb"), "kg");
    expect(kg.weightDraft).toBe("80");
    expect(kg.heightCmDraft).toBe("180.3");
  });
});

describe("initialDraft", () => {
  it("prefills stored answers and the weight feature's figures", () => {
    const draft = initialDraft({
      unit: "kg",
      latestWeightKg: 80,
      targetGoal: { targetWeightKg: 72, rateKgPerWeek: 0.4 },
      hasWeightGoal: true,
      profile: {
        sex: "male",
        birthYear: 1996,
        heightCm: 180,
        activityLevel: "moderate",
        primaryGoal: "lose_fat",
        bodyFatPct: 20,
        bodyFatSource: "visual",
        trainingStyle: null,
        strengthDaysPerWeek: null,
        trainingYears: null,
        trackingStyle: null,
        pregnantOrBreastfeeding: false,
        metabolismCondition: true,
        metabolismAdjustPct: -10,
      },
    });
    expect(draft).toMatchObject({
      weightDraft: "80",
      goalWeightDraft: "72",
      paceDraft: "0.4",
      trackAsWeightGoal: true,
      bodyFatStage: "soft",
      bodyFatDraft: "",
      metabolismDirection: "down",
      metabolismPctDraft: "10",
      saveAnswers: true,
    });
  });
});

describe("copy", () => {
  it("states the range and the figure Use will set, rounded to 10", () => {
    const estimate = readyEstimate(caseA);
    expect(rangeText(estimate)).toBe("2,090–2,550 kcal a day");
    expect(applyButtonText(estimate)).toBe("Use 2,320");
  });

  it("says why a figure stopped at the floor", () => {
    const estimate = readyEstimate({ ...caseA, paceDraft: "1" });
    expect(noticeLines(estimate)).toEqual([
      "That pace is more than 1% of your weight a week.",
      "The estimate stops at 1,780 kcal, the lowest it will suggest.",
    ]);
  });

  it("states the working without a verdict", () => {
    expect(detailLines(readyEstimate(caseA), "kg")).toEqual([
      "BMR 1,780 kcal · maintenance 2,760 kcal",
      "−440 kcal a day for 0.4 kg/week (suggested)",
      "BMI 24.7",
    ]);
  });

  it("dates the goal and says the line is straight", () => {
    const estimate = readyEstimate({ ...caseA, goalWeightDraft: "72" });
    expect(timelineText(estimate, "2026-09-21")).toBe(
      "About 20 weeks, around 8 February, if the pace holds. Real progress usually slows.",
    );
  });
});
