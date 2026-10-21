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

  it("uses no pace for maintain, recomp or not", () => {
    for (const recomp of [false, true]) {
      const estimate = ready({ ...base, primaryGoal: "maintain", holdBandKg: 1, recomp });
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
    [{ primaryGoal: "maintain" as const, paceKgPerWeek: 0.5 }, "pace"],
    [{ primaryGoal: "maintain" as const, holdBandKg: 0 }, "band"],
    [{ primaryGoal: "maintain" as const, recomp: true }, "recomp"],
    [{ holdBandKg: 1 }, "band"],
    [{ recomp: true }, "recomp"],
    [{ paceKgPerWeek: 0 }, "pace"],
    [{ bodyFatPct: 20 }, "body_fat"],
    [{ bodyFatPct: 70, bodyFatSource: "typed" as const }, "body_fat"],
    [{ strengthDaysPerWeek: 8 }, "strength_days"],
    [{ trackingPeriodDays: 0 }, "tracking_period"],
    [{ trackingPeriodDays: 1.5 }, "tracking_period"],
    [{ trackingPeriodDays: 366 }, "tracking_period"],
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

describe("estimateIntake - measured burn", () => {

  it("uses a measured maintenance in place of BMR times activity", () => {
    const measured = {
      kind: "measured" as const,
      kcal: 2410,
      sigma: 120,
      windowDays: 26,
      loggedDays: 23,
    };

    const estimate = estimateIntake({ ...base, primaryGoal: "maintain" }, CURRENT_YEAR, measured);

    expect(estimate.kind).toBe("ready");
    if (estimate.kind !== "ready") throw new Error("expected a ready estimate");
    expect(estimate.maintenanceKcal).toBe(2410);
    expect(estimate.isMeasured).toBe(true);
    // The formula figure is still computed, so Details can state both.
    expect(estimate.formulaMaintenanceKcal).toBeCloseTo(estimate.bmrKcal * 1.55, 6);
    // Sigma replaces the Mifflin width band entirely.
    expect(estimate.highKcal - estimate.pointKcal).toBeCloseTo(120, 6);
  });

  it("falls back to the formula when the burn is insufficient", () => {
    const insufficient = { kind: "insufficient" as const, loggedDays: 9, readings: 4 };

    const measuredEstimate = estimateIntake({ ...base, primaryGoal: "maintain" }, CURRENT_YEAR, insufficient);
    const plainEstimate = estimateIntake({ ...base, primaryGoal: "maintain" }, CURRENT_YEAR);

    expect(measuredEstimate).toEqual(plainEstimate);
    expect(plainEstimate.kind).toBe("ready");
    if (plainEstimate.kind !== "ready") throw new Error("expected a ready estimate");
    expect(plainEstimate.isMeasured).toBe(false);
  });

  it("refuses a measured maintenance below the user's own BMR", () => {
    // What under-logging looks like: a figure the body could not run on. The
    // deficit floor cannot catch it, because the floor is clamped to
    // maintenance so as never to suggest eating more than you burn - so the
    // clamp would follow the bad figure down and then print it as the floor.
    const measured = { kind: "measured" as const, kcal: 1224, sigma: 96, windowDays: 28, loggedDays: 28 };

    const estimate = estimateIntake(base, CURRENT_YEAR, measured);

    expect(estimate.kind).toBe("ready");
    if (estimate.kind !== "ready") throw new Error("expected a ready estimate");
    expect(estimate.isMeasured).toBe(false);
    expect(estimate.maintenanceKcal).toBe(estimate.formulaMaintenanceKcal);
    // The rail is back where it belongs: max(BMR, 1500) for a male.
    expect(estimate.floorKcal).toBeCloseTo(estimate.bmrKcal, 6);
    expect(estimate.pointKcal).toBeGreaterThanOrEqual(estimate.bmrKcal);
  });

  it("keeps the safety rails on a measured maintenance it accepts", () => {
    // Above BMR, so the measurement stands - and the floor still stops the
    // pace's deficit from cutting below it.
    const measured = { kind: "measured" as const, kcal: 2000, sigma: 90, windowDays: 30, loggedDays: 28 };

    const estimate = estimateIntake(base, CURRENT_YEAR, measured);

    expect(estimate.kind).toBe("ready");
    if (estimate.kind !== "ready") throw new Error("expected a ready estimate");
    expect(estimate.isMeasured).toBe(true);
    expect(estimate.maintenanceKcal).toBe(2000);
    // Never above maintenance, never below max(BMR, 1500).
    expect(estimate.floorKcal).toBeCloseTo(estimate.bmrKcal, 6);
    expect(estimate.pointKcal).toBe(estimate.floorKcal);
    expect(estimate.isFloored).toBe(true);
  });
});

// Base BMR is 1780 (10·80 + 6.25·180 − 5·30 + 5). Maintain, so no pace moves
// the point away from maintenance.
describe("estimateIntake - reported intake", () => {
  const maintain: IntakeInput = { ...base, primaryGoal: "maintain" };
  const reported = (patch: Partial<IntakeInput>): IntakeReady => {
    const estimate = estimateIntake({ ...maintain, ...patch }, CURRENT_YEAR);
    if (estimate.kind !== "ready") throw new Error("expected a ready estimate");
    return estimate;
  };

  it("takes a steady intake as maintenance, with its own 15% band", () => {
    const estimate = reported({ currentIntakeKcal: 2400, weightTrend: "steady" });
    expect(estimate.isReported).toBe(true);
    expect(estimate.maintenanceKcal).toBe(2400);
    expect(estimate.highKcal).toBe(2400 + 360);
    expect(estimate.lowKcal).toBe(2400 - 360);
  });

  it("adds the energy a loss stands for: 0.5 kg/week is 550 kcal a day", () => {
    const estimate = reported({ currentIntakeKcal: 2000, weightTrend: "down", weightTrendKgPerWeek: 0.5 });
    expect(estimate.maintenanceKcal).toBe(2550);
  });

  it("subtracts the energy a gain stands for", () => {
    const estimate = reported({ currentIntakeKcal: 3000, weightTrend: "up", weightTrendKgPerWeek: 0.5 });
    expect(estimate.maintenanceKcal).toBe(2450);
  });

  it("refuses a reported maintenance below BMR and keeps the formula, saying why", () => {
    const estimate = reported({ currentIntakeKcal: 1500, weightTrend: "steady" });
    expect(estimate.isReported).toBe(false);
    expect(estimate.maintenanceKcal).toBe(estimate.formulaMaintenanceKcal);
    expect(estimate.reported?.maintenanceKcal).toBe(1500);
  });

  it("lets a measured burn win over a typed intake", () => {
    const measured = { kind: "measured" as const, kcal: 2600, sigma: 90, windowDays: 28, loggedDays: 28 };
    const estimate = estimateIntake(
      { ...maintain, currentIntakeKcal: 2400, weightTrend: "steady" },
      CURRENT_YEAR,
      measured,
    );
    if (estimate.kind !== "ready") throw new Error("expected a ready estimate");
    expect(estimate.isMeasured).toBe(true);
    expect(estimate.isReported).toBe(false);
    expect(estimate.maintenanceKcal).toBe(2600);
  });

  it("leaves the formula alone when no intake is typed", () => {
    const estimate = reported({});
    expect(estimate.isReported).toBe(false);
    expect(estimate.reported).toBeNull();
  });
});

describe("intakeInputError - reported intake", () => {
  const error = (patch: Partial<IntakeInput>) => intakeInputError({ ...base, ...patch }, CURRENT_YEAR);

  it("accepts a steady intake with no rate", () => {
    expect(error({ currentIntakeKcal: 2400, weightTrend: "steady" })).toBeNull();
  });

  it("names the intake for a figure past the typing guards", () => {
    expect(error({ currentIntakeKcal: 400, weightTrend: "steady" })).toBe("current_intake");
    expect(error({ currentIntakeKcal: 10001, weightTrend: "steady" })).toBe("current_intake");
  });

  it("names the trend for a moving trend with no rate, or a steady one with a rate", () => {
    expect(error({ currentIntakeKcal: 2400, weightTrend: "down" })).toBe("weight_trend");
    expect(error({ currentIntakeKcal: 2400, weightTrend: "steady", weightTrendKgPerWeek: 0.5 })).toBe("weight_trend");
  });

  it("refuses a trend with no intake to describe", () => {
    expect(error({ weightTrend: "steady" })).toBe("current_intake");
  });
});
