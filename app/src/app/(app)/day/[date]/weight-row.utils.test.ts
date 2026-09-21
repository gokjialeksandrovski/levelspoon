// app/src/app/(app)/day/[date]/weight-row.utils.test.ts
import { describe, expect, it } from "vitest";

import type { WeightGoal } from "@/features/weight/actions/weight.utils";
import { weightProgress } from "@/features/weight/actions/weight.utils";

import {
  countdownText,
  lastChangeText,
  nextCheckinLineText,
  progressLineText,
  projectionLineText,
} from "./weight-row.utils";

const losingGoal: WeightGoal = {
  mode: "target",
  startWeightKg: 84.8,
  startDate: "2026-09-01",
  targetWeightKg: 72,
  rateKgPerWeek: 0.5,
  holdBandKg: null,
  checkinIntervalDays: 7,
};

const holdGoal: WeightGoal = {
  mode: "hold",
  startWeightKg: 78,
  startDate: "2026-09-01",
  targetWeightKg: null,
  rateKgPerWeek: null,
  holdBandKg: 1,
  checkinIntervalDays: 7,
};

describe("progressLineText", () => {
  it("states distance and rate for a target goal", () => {
    const progress = weightProgress(losingGoal, { measuredOn: "2026-09-21", weightKg: 78.4 });
    expect(progressLineText(progress, losingGoal, "kg")).toBe("78.4 kg · 6.4 to go · 0.5 kg/wk");
  });

  it("states the band for a hold goal", () => {
    const progress = weightProgress(holdGoal, { measuredOn: "2026-09-21", weightKg: 78.4 });
    expect(progressLineText(progress, holdGoal, "kg")).toBe("78.4 kg · holding 78 ±1");
  });

  it("names which side of the band a reading sits on", () => {
    const above = weightProgress(holdGoal, { measuredOn: "2026-09-21", weightKg: 79.6 });
    expect(progressLineText(above, holdGoal, "kg")).toBe("79.6 kg · holding 78 ±1 · 0.6 kg above the band");
    const below = weightProgress(holdGoal, { measuredOn: "2026-09-21", weightKg: 76.5 });
    expect(progressLineText(below, holdGoal, "kg")).toBe("76.5 kg · holding 78 ±1 · 0.5 kg below the band");
  });

  it("states a reached target without celebrating it", () => {
    const progress = weightProgress(losingGoal, { measuredOn: "2026-09-21", weightKg: 72 });
    expect(progressLineText(progress, losingGoal, "kg")).toBe("72 kg · target reached");
  });

  it("states a pound goal entirely in pounds", () => {
    const progress = weightProgress(losingGoal, { measuredOn: "2026-09-21", weightKg: 78.4 });
    expect(progressLineText(progress, losingGoal, "lb")).toBe("172.8 lb · 14.1 to go · 1.1 lb/wk");
  });

  it("asks for the first reading when there is none", () => {
    expect(progressLineText(weightProgress(losingGoal, null), losingGoal, "kg")).toBe("Log your first weight");
  });
});

describe("countdownText", () => {
  it("reads as time left, not a date", () => {
    expect(countdownText({ kind: "days", days: 3 })).toBe("in 3 days");
    expect(countdownText({ kind: "days", days: 1 })).toBe("in 1 day");
    expect(countdownText({ kind: "hours", hours: 18 })).toBe("in 18 hours");
    expect(countdownText({ kind: "hours", hours: 1 })).toBe("in 1 hour");
    expect(countdownText({ kind: "imminent" })).toBe("in under an hour");
    expect(countdownText({ kind: "due" })).toBe("");
  });
});

describe("nextCheckinLineText", () => {
  it("carries weekday, countdown and the target", () => {
    expect(nextCheckinLineText("2026-09-27", { kind: "days", days: 3 }, losingGoal, "kg")).toBe(
      "Next weigh-in Sunday · in 3 days · target 72 kg",
    );
  });

  it("names the held weight instead of a target on a hold goal", () => {
    expect(nextCheckinLineText("2026-09-27", { kind: "hours", hours: 12 }, holdGoal, "kg")).toBe(
      "Next weigh-in Sunday · in 12 hours · holding 78 kg",
    );
  });
});

describe("projectionLineText", () => {
  it("states the arithmetic over the user's own numbers", () => {
    expect(projectionLineText(losingGoal, 78.4, "2026-09-21", "kg")).toBe("At 0.5 kg/week, 72 kg around 20 December");
  });

  it("has nothing to say for a hold goal or a reached target", () => {
    expect(projectionLineText(holdGoal, 78, "2026-09-21", "kg")).toBeNull();
    expect(projectionLineText(losingGoal, 72, "2026-09-21", "kg")).toBeNull();
  });
});

describe("lastChangeText", () => {
  it("signs the change", () => {
    expect(
      lastChangeText(
        { measuredOn: "2026-09-21", weightKg: 78.4 },
        { measuredOn: "2026-09-14", weightKg: 78.7 },
        losingGoal,
        "kg",
      ),
    ).toBe("Started 84.8 kg on 1 September · last change −0.3 kg");
  });

  it("prints the same readings in pounds when that is the unit", () => {
    expect(
      lastChangeText(
        { measuredOn: "2026-09-21", weightKg: 78.4 },
        { measuredOn: "2026-09-14", weightKg: 78.7 },
        losingGoal,
        "lb",
      ),
    ).toBe("Started 187 lb on 1 September · last change −0.7 lb");
  });

  it("omits the change with only one reading", () => {
    expect(lastChangeText({ measuredOn: "2026-09-21", weightKg: 78.4 }, null, losingGoal, "kg")).toBe(
      "Started 84.8 kg on 1 September",
    );
  });
});
