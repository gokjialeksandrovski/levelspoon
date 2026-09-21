import { describe, expect, it } from "vitest";

import {
  estimateIntake,
  intakeInputError,
  roundKcal,
  stageBodyFatPct,
  stageForBodyFat,
  yearOf,
  type IntakeInput,
  type IntakeReady,
} from "./intake.utils";

const CURRENT_YEAR = 2026;

// Male, 30, 180 cm, 80 kg, Active, losing fat, nothing optional. Every
// expected figure below is worked by hand from spec §6 and noted beside it.
const base: IntakeInput = {
  sex: "male",
  birthYear: 1996,
  heightCm: 180,
  weightKg: 80,
  activityLevel: "moderate",
  primaryGoal: "lose_fat",
  goalWeightKg: null,
  paceKgPerWeek: null,
  bodyFatPct: null,
  bodyFatSource: null,
  trainingStyle: null,
  strengthDaysPerWeek: null,
  trainingYears: null,
  trackingStyle: null,
  pregnantOrBreastfeeding: false,
  metabolismCondition: false,
  metabolismAdjustPct: null,
};

const ready = (input: IntakeInput): IntakeReady => {
  const estimate = estimateIntake(input, CURRENT_YEAR);
  if (estimate.kind !== "ready") throw new Error(`expected a ready estimate, got ${estimate.kind}`);
  return estimate;
};

describe("estimateIntake - Mifflin-St Jeor", () => {
  it("works out BMR, maintenance, the suggested deficit and a ±10% range", () => {
    const estimate = ready(base);
    // 10·80 + 6.25·180 − 5·30 + 5
    expect(estimate.bmrKcal).toBeCloseTo(1780);
    // × 1.55
    expect(estimate.maintenanceKcal).toBeCloseTo(2759);
    // 0.5% of 80 kg = 0.4 kg/week; 0.4 × 7700 / 7
    expect(estimate.paceKgPerWeek).toBeCloseTo(0.4);
    expect(estimate.isPaceSuggested).toBe(true);
    expect(estimate.adjustmentKcal).toBeCloseTo(-440);
    expect(estimate.pointKcal).toBeCloseTo(2319);
    expect(estimate.lowKcal).toBeCloseTo(2087.1);
    expect(estimate.highKcal).toBeCloseTo(2550.9);
    expect(estimate.isFloored).toBe(false);
    expect(estimate.bmi).toBeCloseTo(24.691, 3);
    expect(estimate.leanMassKg).toBeNull();
    expect(estimate.weeksToGoal).toBeNull();
  });

  it("averages the sex constants and widens by half their gap when sex is not given", () => {
    const estimate = ready({ ...base, sex: "unspecified", primaryGoal: "maintain" });
    // −78 is the midpoint of +5 and −161
    expect(estimate.bmrKcal).toBeCloseTo(1697);
    expect(estimate.pointKcal).toBeCloseTo(2630.35);
    // 10% of 2630.35, plus 83 kcal each side
    expect(estimate.highKcal - estimate.pointKcal).toBeCloseTo(346.035);
  });
});

describe("estimateIntake - Katch-McArdle", () => {
  it("switches formula on a typed body fat and narrows to ±8%", () => {
    const estimate = ready({ ...base, primaryGoal: "maintain", bodyFatPct: 20, bodyFatSource: "typed" });
    // lean mass 64 kg; 370 + 21.6 · 64
    expect(estimate.leanMassKg).toBeCloseTo(64);
    expect(estimate.bmrKcal).toBeCloseTo(1752.4);
    expect(estimate.pointKcal).toBeCloseTo(2716.22);
    expect(estimate.highKcal - estimate.pointKcal).toBeCloseTo(217.2976);
    // 64 / 1.8²
    expect(estimate.ffmi).toBeCloseTo(19.753, 3);
  });

  it("keeps ±10% for a visual body-fat stage", () => {
    const estimate = ready({ ...base, primaryGoal: "maintain", bodyFatPct: 20, bodyFatSource: "visual" });
    expect(estimate.highKcal - estimate.pointKcal).toBeCloseTo(271.622);
  });
});

describe("estimateIntake - metabolism", () => {
  it("scales BMR by the user's figure and adds 5% of width", () => {
    const estimate = ready({ ...base, primaryGoal: "maintain", metabolismCondition: true, metabolismAdjustPct: -10 });
    expect(estimate.bmrKcal).toBeCloseTo(1602);
    expect(estimate.pointKcal).toBeCloseTo(2483.1);
    // 15% of 2483.1
    expect(estimate.highKcal - estimate.pointKcal).toBeCloseTo(372.465);
  });

  it("adds 10% of width and shifts nothing when the condition has no figure", () => {
    const estimate = ready({ ...base, primaryGoal: "maintain", metabolismCondition: true });
    expect(estimate.pointKcal).toBeCloseTo(2759);
    expect(estimate.highKcal - estimate.pointKcal).toBeCloseTo(551.8);
  });
});

describe("estimateIntake - goals and pace", () => {
  it("suggests a gain pace from training years", () => {
    // 80 kg × 0.5%/month × 12 / 52
    const advanced = ready({ ...base, primaryGoal: "gain_muscle", trainingYears: "over_3" });
    expect(advanced.paceKgPerWeek).toBeCloseTo(0.0923, 4);
    expect(advanced.adjustmentKcal).toBeCloseTo(101.538, 2);
    // unknown years → 1%/month
    const unknown = ready({ ...base, primaryGoal: "gain_muscle" });
    expect(unknown.paceKgPerWeek).toBeCloseTo(0.1846, 4);
  });

  it("uses no pace for maintain and recomp", () => {
    for (const primaryGoal of ["maintain", "recomp"] as const) {
      const estimate = ready({ ...base, primaryGoal });
      expect(estimate.paceKgPerWeek).toBeNull();
      expect(estimate.adjustmentKcal).toBe(0);
      expect(estimate.pointKcal).toBeCloseTo(2759);
    }
  });

  it("states a typed pace past the cap and floors the result", () => {
    const estimate = ready({ ...base, paceKgPerWeek: 1 });
    // cap is 1% of 80 kg = 0.8
    expect(estimate.isPaceOverCap).toBe(true);
    expect(estimate.paceCapSharePerWeek).toBe(0.01);
    // 2759 − 1100 = 1659, below the floor of max(BMR 1780, 1500)
    expect(estimate.isFloored).toBe(true);
    expect(estimate.pointKcal).toBeCloseTo(1780);
    expect(estimate.lowKcal).toBeCloseTo(1780);
  });

  it("floors a deficit at BMR when BMR is above the sex minimum", () => {
    const estimate = ready({
      ...base,
      sex: "female",
      birthYear: 1986,
      heightCm: 165,
      weightKg: 65,
      activityLevel: "sedentary",
    });
    // BMR 650 + 1031.25 − 200 − 161; maintenance × 1.2; raw 1584.3 − 357.5
    expect(estimate.bmrKcal).toBeCloseTo(1320.25);
    expect(estimate.isFloored).toBe(true);
    expect(estimate.pointKcal).toBeCloseTo(1320.25);
  });

  it("never floors above maintenance", () => {
    // BMR 1480 → maintenance 1776 at 1.2; the 1500 floor sits below it
    const estimate = ready({ ...base, weightKg: 50, activityLevel: "sedentary", primaryGoal: "maintain" });
    expect(estimate.pointKcal).toBeCloseTo(1776);
    expect(estimate.isFloored).toBe(false);
  });

  it("shows maintenance, not a deficit, below BMI 18.5", () => {
    const estimate = ready({ ...base, weightKg: 50 });
    expect(estimate.bmi).toBeCloseTo(15.432, 3);
    expect(estimate.isMaintenanceOnly).toBe(true);
    expect(estimate.adjustmentKcal).toBe(0);
    expect(estimate.pointKcal).toBeCloseTo(estimate.maintenanceKcal);
  });

  it("works out weeks to a goal weight at the pace in use", () => {
    expect(ready({ ...base, goalWeightKg: 72 }).weeksToGoal).toBeCloseTo(20);
  });
});

describe("estimateIntake - refusals", () => {
  it("gives no estimate under 18", () => {
    expect(estimateIntake({ ...base, birthYear: 2009 }, CURRENT_YEAR)).toEqual({ kind: "refused", reason: "under_18" });
  });

  it("gives no estimate in pregnancy or while breastfeeding", () => {
    expect(estimateIntake({ ...base, sex: "female", pregnantOrBreastfeeding: true }, CURRENT_YEAR)).toEqual({
      kind: "refused",
      reason: "pregnancy",
    });
  });
});

describe("intakeInputError", () => {
  it("accepts the base input", () => {
    expect(intakeInputError(base, CURRENT_YEAR)).toBeNull();
  });

  it("treats under-18 as a refusal, not a bad field", () => {
    expect(intakeInputError({ ...base, birthYear: 2009 }, CURRENT_YEAR)).toBeNull();
  });

  it.each([
    [{ birthYear: 2027 }, "birth_year"],
    [{ birthYear: 1900 }, "birth_year"],
    [{ birthYear: 1996.5 }, "birth_year"],
    [{ heightCm: 90 }, "height"],
    [{ weightKg: 20 }, "weight"],
    [{ goalWeightKg: 85 }, "goal_direction"],
    [{ primaryGoal: "gain_muscle" as const, goalWeightKg: 75 }, "goal_direction"],
    [{ goalWeightKg: 10 }, "goal_weight"],
    [{ primaryGoal: "maintain" as const, goalWeightKg: 75 }, "goal_weight"],
    [{ primaryGoal: "recomp" as const, paceKgPerWeek: 0.5 }, "pace"],
    [{ paceKgPerWeek: 0 }, "pace"],
    [{ bodyFatPct: 20 }, "body_fat"],
    [{ bodyFatPct: 70, bodyFatSource: "typed" as const }, "body_fat"],
    [{ strengthDaysPerWeek: 8 }, "strength_days"],
    [{ metabolismAdjustPct: 10 }, "metabolism"],
    [{ metabolismCondition: true, metabolismAdjustPct: 31 }, "metabolism"],
    [{ metabolismCondition: true, metabolismAdjustPct: 0 }, "metabolism"],
  ])("refuses %o as %s", (patch, field) => {
    expect(intakeInputError({ ...base, ...patch }, CURRENT_YEAR)).toBe(field);
  });
});

describe("body-fat stages", () => {
  it("maps a stage to its midpoint per sex, and the mean when sex is not given", () => {
    expect(stageBodyFatPct("soft", "male")).toBe(20);
    expect(stageBodyFatPct("soft", "female")).toBe(28);
    expect(stageBodyFatPct("large", "unspecified")).toBe(38.5);
  });

  it("finds a stored stage again, and nothing for a typed figure", () => {
    expect(stageForBodyFat(20, "male")).toBe("soft");
    expect(stageForBodyFat(21, "male")).toBeNull();
  });
});

describe("small helpers", () => {
  it("rounds kcal to the nearest 10", () => {
    expect(roundKcal(2319)).toBe(2320);
    expect(roundKcal(2087.1)).toBe(2090);
  });

  it("reads the year off a local date", () => {
    expect(yearOf("2026-09-21")).toBe(2026);
  });
});
