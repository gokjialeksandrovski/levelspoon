// app/src/features/weight/actions/weight.utils.test.ts
import { describe, expect, it } from "vitest";

import {
  bandPresets,
  checkinCountdown,
  commitWeightDraft,
  defaultPace,
  displayWeight,
  draftToKg,
  fromKg,
  isValidCheckinInterval,
  pacePresets,
  toKg,
  isCheckinDue,
  isUnusableWeightDraft,
  isValidWeightKg,
  nextCheckinDate,
  projectedTargetDate,
  roundToTenth,
  weightChange,
  weightGoalInputError,
  weightProgress,
  type WeightGoal,
} from "./weight.utils";

const losingGoal: WeightGoal = {
  mode: "target",
  startWeightKg: 84.8,
  startDate: "2026-09-01",
  targetWeightKg: 72,
  rateKgPerWeek: 0.5,
  holdBandKg: null,
  checkinIntervalDays: 7,
};

const gainingGoal: WeightGoal = { ...losingGoal, startWeightKg: 64, targetWeightKg: 70 };

const holdGoal: WeightGoal = {
  mode: "hold",
  startWeightKg: 78,
  startDate: "2026-09-01",
  targetWeightKg: null,
  rateKgPerWeek: null,
  holdBandKg: 1,
  checkinIntervalDays: 14,
};

describe("roundToTenth", () => {
  it("keeps one decimal without float dust", () => {
    expect(roundToTenth(78.44)).toBe(78.4);
    expect(roundToTenth(78.45)).toBe(78.5);
    expect(roundToTenth(0.1 + 0.2)).toBe(0.3);
  });
});

describe("isValidWeightKg", () => {
  it("accepts a plausible reading", () => {
    expect(isValidWeightKg(78.4)).toBe(true);
  });

  it("refuses values outside the storage guard", () => {
    expect(isValidWeightKg(29.9)).toBe(false);
    expect(isValidWeightKg(300.1)).toBe(false);
    expect(isValidWeightKg(Number.NaN)).toBe(false);
  });
});

describe("weight drafts", () => {
  it("reads a comma decimal separator", () => {
    expect(commitWeightDraft("78,4", "kg", 80)).toBe(78.4);
  });

  it("treats an empty or unreadable draft as unusable and keeps the fallback", () => {
    expect(isUnusableWeightDraft("", "kg")).toBe(true);
    expect(isUnusableWeightDraft("abc", "kg")).toBe(true);
    expect(isUnusableWeightDraft("12", "kg")).toBe(true);
    expect(commitWeightDraft("abc", "kg", 80)).toBe(80);
  });

  it("rounds a usable draft to one decimal", () => {
    expect(commitWeightDraft(" 78.46 ", "kg", 80)).toBe(78.5);
  });

  it("reads a pound draft in pounds, and refuses one below the kilogram guard", () => {
    // 172.7 lb is a plausible reading; 60 lb is under MIN_WEIGHT_KG.
    expect(isUnusableWeightDraft("172.7", "lb")).toBe(false);
    expect(isUnusableWeightDraft("60", "lb")).toBe(true);
  });
});

describe("units", () => {
  it("round-trips a pound reading without moving it", () => {
    // The bug this precision exists for: at one stored decimal, 172.7 lb came
    // back as 172.6 lb.
    expect(displayWeight(draftToKg("172.7", "lb"), "lb")).toBe(172.7);
    expect(displayWeight(draftToKg("78.4", "kg"), "kg")).toBe(78.4);
  });

  it("converts on the international pound", () => {
    expect(toKg(1, "lb")).toBeCloseTo(0.45359237);
    expect(fromKg(1, "lb")).toBeCloseTo(2.2046226);
    expect(toKg(80, "kg")).toBe(80);
  });

  it("offers round presets in each unit rather than converted ones", () => {
    expect(pacePresets("kg")).toEqual([0.25, 0.5, 0.75, 1]);
    expect(pacePresets("lb")).toEqual([0.5, 1, 1.5, 2]);
    expect(bandPresets("lb")).toEqual([1, 2, 3, 4]);
    expect(defaultPace("lb")).toBe(1);
  });
});

describe("isValidCheckinInterval", () => {
  it("accepts any whole number of days from one", () => {
    expect(isValidCheckinInterval(1)).toBe(true);
    expect(isValidCheckinInterval(2)).toBe(true);
    expect(isValidCheckinInterval(365)).toBe(true);
  });

  it("refuses a zero, a fraction and a figure past a year", () => {
    expect(isValidCheckinInterval(0)).toBe(false);
    expect(isValidCheckinInterval(1.5)).toBe(false);
    expect(isValidCheckinInterval(366)).toBe(false);
    expect(isValidCheckinInterval(Number.NaN)).toBe(false);
  });
});

describe("weightGoalInputError", () => {
  const validTarget = {
    mode: "target" as const,
    unit: "kg" as const,
    currentWeightKg: 84.8,
    targetWeightKg: 72,
    rateKgPerWeek: 0.5,
    holdBandKg: null,
    checkinIntervalDays: 7,
  };

  it("passes a valid target goal", () => {
    expect(weightGoalInputError(validTarget)).toBeNull();
  });

  it("names the offending field", () => {
    expect(weightGoalInputError({ ...validTarget, currentWeightKg: 12 })).toBe("weight");
    expect(weightGoalInputError({ ...validTarget, targetWeightKg: 500 })).toBe("target");
    expect(weightGoalInputError({ ...validTarget, rateKgPerWeek: 0 })).toBe("rate");
    expect(weightGoalInputError({ ...validTarget, checkinIntervalDays: 0 })).toBe("cadence");
    expect(weightGoalInputError({ ...validTarget, targetWeightKg: 84.8 })).toBe("target_equals_current");
  });

  it("requires a band and no rate for a hold goal", () => {
    const hold = { ...validTarget, mode: "hold" as const, targetWeightKg: null, rateKgPerWeek: null, holdBandKg: 1 };
    expect(weightGoalInputError(hold)).toBeNull();
    expect(weightGoalInputError({ ...hold, holdBandKg: 0 })).toBe("band");
  });

  it("takes a pace and a cadence the presets never offered", () => {
    expect(weightGoalInputError({ ...validTarget, rateKgPerWeek: 1.6 })).toBeNull();
    expect(weightGoalInputError({ ...validTarget, checkinIntervalDays: 2 })).toBeNull();
  });
});

describe("weightProgress", () => {
  it("reports a losing goal's remaining distance", () => {
    const progress = weightProgress(losingGoal, { measuredOn: "2026-09-21", weightKg: 78.4 });
    expect(progress.kind).toBe("losing");
    if (progress.kind !== "losing") return;
    expect(progress.remainingKg).toBeCloseTo(6.4);
    // 6.4 of 12.8 kg closed.
    expect(progress.fillShare).toBeCloseTo(0.5);
    expect(progress.railShare).toBeCloseTo(0.5);
  });

  it("reports a gaining goal in the same shape", () => {
    const progress = weightProgress(gainingGoal, { measuredOn: "2026-09-21", weightKg: 67 });
    expect(progress.kind).toBe("gaining");
    if (progress.kind !== "gaining") return;
    expect(progress.remainingKg).toBeCloseTo(3);
    expect(progress.fillShare).toBeCloseTo(0.5);
  });

  it("reports a reached target, and clamps past it", () => {
    expect(weightProgress(losingGoal, { measuredOn: "2026-09-21", weightKg: 72 }).kind).toBe("reached");
    const past = weightProgress(losingGoal, { measuredOn: "2026-09-21", weightKg: 70.5 });
    expect(past.kind).toBe("reached");
    expect(past.railShare).toBe(1);
  });

  it("places a hold reading inside its band", () => {
    const progress = weightProgress(holdGoal, { measuredOn: "2026-09-21", weightKg: 78.5 });
    expect(progress.kind).toBe("holding");
    if (progress.kind !== "holding") return;
    expect(progress.outsideByKg).toBe(0);
    expect(progress.railShare).toBeCloseTo(0.75);
  });

  it("states how far outside the band a reading is, signed", () => {
    const above = weightProgress(holdGoal, { measuredOn: "2026-09-21", weightKg: 79.6 });
    if (above.kind !== "holding") throw new Error("expected holding");
    expect(above.outsideByKg).toBeCloseTo(0.6);
    expect(above.railShare).toBe(1);

    const below = weightProgress(holdGoal, { measuredOn: "2026-09-21", weightKg: 76.5 });
    if (below.kind !== "holding") throw new Error("expected holding");
    expect(below.outsideByKg).toBeCloseTo(-0.5);
    expect(below.railShare).toBe(0);
  });

  it("has a state for a goal with no reading yet", () => {
    expect(weightProgress(losingGoal, null).kind).toBe("no-entries");
  });
});

describe("check-ins", () => {
  it("counts from the last reading, else from the goal's start", () => {
    expect(nextCheckinDate(losingGoal, { measuredOn: "2026-09-18", weightKg: 78.4 })).toBe("2026-09-25");
    expect(nextCheckinDate(losingGoal, null)).toBe("2026-09-08");
    expect(nextCheckinDate(holdGoal, { measuredOn: "2026-09-18", weightKg: 78 })).toBe("2026-10-02");
  });

  it("is due on the day and every day after", () => {
    expect(isCheckinDue("2026-09-25", "2026-09-24")).toBe(false);
    expect(isCheckinDue("2026-09-25", "2026-09-25")).toBe(true);
    expect(isCheckinDue("2026-09-25", "2026-09-28")).toBe(true);
  });
});

describe("checkinCountdown", () => {
  const timezone = "Europe/Berlin";

  it("counts whole days when a day or more is left", () => {
    // Due at local midnight starting the 25th; 3.5 days out.
    expect(checkinCountdown("2026-09-25", new Date("2026-09-21T10:00:00Z"), timezone)).toEqual({
      kind: "days",
      days: 4,
    });
  });

  it("switches to hours under a day", () => {
    expect(checkinCountdown("2026-09-22", new Date("2026-09-21T10:00:00Z"), timezone)).toEqual({
      kind: "hours",
      hours: 12,
    });
  });

  it("says under an hour rather than zero", () => {
    expect(checkinCountdown("2026-09-22", new Date("2026-09-21T21:40:00Z"), timezone)).toEqual({
      kind: "imminent",
    });
  });

  it("reports due once the instant has passed", () => {
    expect(checkinCountdown("2026-09-21", new Date("2026-09-21T10:00:00Z"), timezone)).toEqual({ kind: "due" });
  });
});

describe("projectedTargetDate", () => {
  it("projects from the user's own rate", () => {
    // 6.4 kg at 0.5 kg/week = 12.8 weeks = 90 days.
    expect(projectedTargetDate(losingGoal, 78.4, "2026-09-21")).toBe("2026-12-20");
  });

  it("has nothing to project for a hold goal or a reached target", () => {
    expect(projectedTargetDate(holdGoal, 78, "2026-09-21")).toBeNull();
    expect(projectedTargetDate(losingGoal, 72, "2026-09-21")).toBeNull();
  });
});

describe("weightChange", () => {
  it("is the signed difference from the previous reading", () => {
    expect(
      weightChange({ measuredOn: "2026-09-21", weightKg: 78.4 }, { measuredOn: "2026-09-14", weightKg: 78.7 }),
    ).toBeCloseTo(-0.3);
  });

  it("is null with only one reading", () => {
    expect(weightChange({ measuredOn: "2026-09-21", weightKg: 78.4 }, null)).toBeNull();
  });
});
