import { describe, expect, it } from "vitest";

import { MacroTargetsNeedGoalError } from "./goals.errors";
import {
  convertTargetsDraft,
  EMPTY_TARGETS_DRAFT,
  GRAM_TARGET_CEILING,
  gramTargets,
  isValidMacroTargets,
  readTargetsDraft,
  recompProteinGrams,
  targetsToDraft,
} from "./macro-targets.utils";

const pct = (protein: number | null, carbs: number | null, fat: number | null) => ({
  unit: "pct" as const,
  values: { protein, carbs, fat },
});
const grams = (protein: number | null, carbs: number | null, fat: number | null) => ({
  unit: "g" as const,
  values: { protein, carbs, fat },
});

describe("isValidMacroTargets", () => {
  it("accepts one tracked share, and three that fill the day", () => {
    expect(isValidMacroTargets(pct(30, null, null))).toBe(true);
    expect(isValidMacroTargets(pct(30, 40, 30))).toBe(true);
  });

  it("refuses shares that overfill the day, or three that fall short of it", () => {
    expect(isValidMacroTargets(pct(60, null, 50))).toBe(false);
    expect(isValidMacroTargets(pct(30, 40, 20))).toBe(false);
  });

  it("puts no sum rule on grams, only the storage bound", () => {
    expect(isValidMacroTargets(grams(150, 400, 120))).toBe(true);
    expect(isValidMacroTargets(grams(GRAM_TARGET_CEILING + 1, null, null))).toBe(false);
  });

  it("refuses nothing tracked, fractions and negatives", () => {
    expect(isValidMacroTargets(grams(null, null, null))).toBe(false);
    expect(isValidMacroTargets(grams(150.5, null, null))).toBe(false);
    expect(isValidMacroTargets(grams(-1, null, null))).toBe(false);
  });
});

describe("readTargetsDraft", () => {
  it("reads three blanks as no targets", () => {
    expect(readTargetsDraft(EMPTY_TARGETS_DRAFT, "g")).toEqual({ kind: "empty" });
  });

  it("reads a blank as untracked, never as zero", () => {
    expect(readTargetsDraft({ protein: "150", carbs: "", fat: " " }, "g")).toEqual({
      kind: "ready",
      targets: grams(150, null, null),
    });
  });

  it("states the total of shares that do not fit", () => {
    expect(readTargetsDraft({ protein: "30", carbs: "40", fat: "25" }, "pct")).toMatchObject({ kind: "off", totalPct: 95 });
    expect(readTargetsDraft({ protein: "70", carbs: "", fat: "40" }, "pct")).toMatchObject({ kind: "off", totalPct: 110 });
  });

  it("refuses text, fractions and a share past 100", () => {
    expect(readTargetsDraft({ protein: "abc", carbs: "", fat: "" }, "g")).toEqual({ kind: "unreadable" });
    expect(readTargetsDraft({ protein: "30.5", carbs: "", fat: "" }, "pct")).toEqual({ kind: "unreadable" });
    expect(readTargetsDraft({ protein: "120", carbs: "", fat: "" }, "pct")).toEqual({ kind: "unreadable" });
  });

  it("round-trips stored targets through the draft", () => {
    const targets = pct(25, null, 25);
    expect(readTargetsDraft(targetsToDraft(targets), "pct")).toEqual({ kind: "ready", targets });
    expect(targetsToDraft(null)).toEqual(EMPTY_TARGETS_DRAFT);
  });
});

describe("convertTargetsDraft", () => {
  it("turns shares into grams at 4 / 4 / 9 kcal per gram when the kcal goal goes", () => {
    expect(convertTargetsDraft({ protein: "30", carbs: "40", fat: "30" }, 2100, "g")).toEqual({
      protein: "158",
      carbs: "210",
      fat: "70",
    });
  });

  it("turns grams back into shares of the goal when one is set", () => {
    expect(convertTargetsDraft({ protein: "150", carbs: "", fat: "" }, 2000, "pct")).toEqual({
      protein: "30",
      carbs: "",
      fat: "",
    });
  });

  it("leaves blanks and unreadable text as typed", () => {
    expect(convertTargetsDraft({ protein: "", carbs: "abc", fat: "30" }, 2100, "g")).toEqual({
      protein: "",
      carbs: "abc",
      fat: "70",
    });
  });
});

describe("gramTargets", () => {
  it("reads gram targets as they are, kcal goal or not", () => {
    expect(gramTargets(grams(150, null, null), null)).toEqual({ protein: 150, carbs: null, fat: null });
  });

  it("works shares out against the kcal goal, leaving untracked macros null", () => {
    expect(gramTargets(pct(30, null, 30), 2100)).toEqual({ protein: 158, carbs: null, fat: 70 });
  });

  it("refuses a share with no kcal goal to take it from", () => {
    expect(() => gramTargets(pct(30, null, null), null)).toThrow(MacroTargetsNeedGoalError);
  });
});

describe("recompProteinGrams", () => {
  it("reads body weight at 1.8 g per kg, to the nearest gram", () => {
    expect(recompProteinGrams(78)).toBe(140);
    expect(recompProteinGrams(84.8)).toBe(153);
  });
});
