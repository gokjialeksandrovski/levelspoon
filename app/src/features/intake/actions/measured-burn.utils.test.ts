import { describe, expect, it } from "vitest";

import { addCalendarDays } from "@/lib/date/day-bounds";

import { measuredBurn, type LoggedDay, type WeightReading } from "./measured-burn.utils";

const TODAY = "2026-09-23";

// Index 0 is the oldest day, index count-1 is TODAY - the same direction the
// regression's day index runs in, so a test reads like the series it describes.
const dateAt = (count: number, index: number): string => addCalendarDays(TODAY, index - (count - 1));

const indices = (count: number): number[] => Array.from({ length: count }, (_unused, index) => index);

const loggedSeries = (count: number, kcal: (index: number) => number): LoggedDay[] =>
  indices(count).map((index) => ({ date: dateAt(count, index), kcal: kcal(index) }));

const readingSeries = (count: number, weightKg: (index: number) => number): WeightReading[] =>
  indices(count).map((index) => ({ date: dateAt(count, index), weightKg: weightKg(index) }));

const CONSTANT_KCAL = 2200;
const FLAT_KG = 80;

describe("measuredBurn", () => {
  it("returns mean intake as maintenance when weight does not move", () => {
    const result = measuredBurn(
      loggedSeries(28, () => CONSTANT_KCAL),
      readingSeries(28, () => FLAT_KG),
      TODAY,
    );

    // A flat line burns exactly what it eats. Perfect data has no scatter, so
    // the shortest window already clears the error ceiling.
    expect(result).toEqual({
      kind: "measured",
      kcal: CONSTANT_KCAL,
      sigma: 0,
      windowDays: 14,
      loggedDays: 14,
    });
  });

  const LOSS_KG = 0.5;
  const SPAN_DAYS = 27;
  const BASE_KCAL = 2000;

  it("puts maintenance above mean intake while weight falls", () => {
    const result = measuredBurn(
      loggedSeries(28, () => BASE_KCAL),
      readingSeries(28, (index) => FLAT_KG - (index * LOSS_KG) / SPAN_DAYS),
      TODAY,
    );

    // 0.5 kg over 27 days is 0.018518 kg/day, worth 142.59 kcal/day at 7700.
    expect(result).toMatchObject({ kind: "measured" });
    if (result.kind !== "measured") throw new Error("expected a measured result");
    expect(result.kcal).toBeCloseTo(BASE_KCAL + (LOSS_KG / SPAN_DAYS) * 7700, 2);
  });

  it("puts maintenance below mean intake while weight rises", () => {
    const result = measuredBurn(
      loggedSeries(28, () => BASE_KCAL),
      readingSeries(28, (index) => FLAT_KG + (index * LOSS_KG) / SPAN_DAYS),
      TODAY,
    );

    expect(result).toMatchObject({ kind: "measured" });
    if (result.kind !== "measured") throw new Error("expected a measured result");
    expect(result.kcal).toBeCloseTo(BASE_KCAL - (LOSS_KG / SPAN_DAYS) * 7700, 2);
  });

  it("matches a slope and standard error worked out by hand", () => {
    // Readings on window days 0, 3, 6, 9, 12 of a 14-day window:
    //   t = 0,3,6,9,12          t_mean = 6      sum (t - t_mean)^2 = 90
    //   w = 80.0,79.8,79.7,79.4,79.3            w_mean = 79.64
    //   sum (t - t_mean)(w - w_mean) = -5.40
    //   slope = -5.40 / 90 = -0.06 kg/day
    //   residuals = 0, -0.02, 0.06, -0.06, 0.02   sum of squares = 0.008
    //   s^2 = 0.008 / 3 = 0.00266667
    //   SEb = sqrt(0.00266667 / 90) = 0.00544331
    //   maintenance = 2000 - (-0.06 * 7700) = 2462
    //   sigma = 7700 * 0.00544331 = 41.9135 (intake is constant, so its own
    //           error is zero)
    const weightByIndex = new Map([
      [0, 80.0],
      [3, 79.8],
      [6, 79.7],
      [9, 79.4],
      [12, 79.3],
    ]);
    const readings = [...weightByIndex].map(([index, weightKg]) => ({
      date: dateAt(14, index),
      weightKg,
    }));

    const result = measuredBurn(loggedSeries(14, () => BASE_KCAL), readings, TODAY);

    expect(result).toMatchObject({ kind: "measured", windowDays: 14, loggedDays: 14 });
    if (result.kind !== "measured") throw new Error("expected a measured result");
    expect(result.kcal).toBeCloseTo(2462, 4);
    expect(result.sigma).toBeCloseTo(41.9135, 3);
  });

  it("grows the window past one that is too sparsely logged", () => {
    // 28 days of daily readings and flat weight, but four of the last 14 days
    // carry no meal at all. Coverage by window: 14 -> 10/14 = 0.714,
    // 18 -> 14/18 = 0.778, 19 -> 15/19 = 0.789, 20 -> 16/20 = 0.80. Twenty is
    // the first that clears MIN_COVERAGE.
    const unloggedIndices = new Set([15, 17, 19, 21]);
    const logged = loggedSeries(28, () => CONSTANT_KCAL).filter(
      (_unused, index) => !unloggedIndices.has(index),
    );

    const result = measuredBurn(logged, readingSeries(28, () => FLAT_KG), TODAY);

    expect(result).toMatchObject({ kind: "measured", windowDays: 20, loggedDays: 16 });
  });

  it("refuses when there are too few readings, whatever the logs look like", () => {
    const readings = [0, 1, 2, 3].map((index) => ({ date: dateAt(28, index), weightKg: FLAT_KG }));

    const result = measuredBurn(loggedSeries(28, () => CONSTANT_KCAL), readings, TODAY);

    expect(result).toEqual({ kind: "insufficient", loggedDays: 28, readings: 4 });
  });

  it("refuses when the readings are too scattered to fit", () => {
    // Five readings inside three days: the slope's denominator is tiny, so its
    // standard error is enormous however long the window grows.
    const scatteredReadings = [80.0, 79.0, 80.5, 79.2, 80.3].map((weightKg, index) => ({
      date: dateAt(56, Math.min(index, 2)),
      weightKg,
    }));

    const result = measuredBurn(loggedSeries(56, () => CONSTANT_KCAL), scatteredReadings, TODAY);

    expect(result).toMatchObject({ kind: "insufficient", loggedDays: 56 });
  });

  // Alternating +/-0.5 kg around a flat line: deterministic, and the same
  // 0.5 kg day-to-day scatter spec §4.7 assumes for a consistent morning
  // weigher at 80 kg.
  const scattered = (index: number): number => FLAT_KG + (index % 2 === 0 ? 0.5 : -0.5);

  it("refuses a fortnight of realistically noisy readings (spec section 4.7)", () => {
    const result = measuredBurn(loggedSeries(14, () => CONSTANT_KCAL), readingSeries(14, scattered), TODAY);

    expect(result).toEqual({ kind: "insufficient", loggedDays: 14, readings: 14 });
  });

  it("accepts four weeks of the same noise", () => {
    const result = measuredBurn(loggedSeries(28, () => CONSTANT_KCAL), readingSeries(28, scattered), TODAY);

    expect(result).toMatchObject({ kind: "measured" });
    if (result.kind !== "measured") throw new Error("expected a measured result");
    expect(result.windowDays).toBeGreaterThan(14);
    expect(result.windowDays).toBeLessThanOrEqual(28);
  });

  it("refuses when every reading lands on one day", () => {
    const sameDay = [80.0, 79.9, 80.1, 79.8, 80.2].map((weightKg) => ({ date: dateAt(28, 0), weightKg }));

    const result = measuredBurn(loggedSeries(28, () => CONSTANT_KCAL), sameDay, TODAY);

    expect(result).toEqual({ kind: "insufficient", loggedDays: 28, readings: 5 });
  });

  it("returns a finite figure with a single logged day", () => {
    const result = measuredBurn(
      [{ date: TODAY, kcal: CONSTANT_KCAL }],
      readingSeries(28, () => FLAT_KG),
      TODAY,
    );

    // The coverage floor refuses it, but nothing along the way is NaN.
    expect(result).toEqual({ kind: "insufficient", loggedDays: 1, readings: 28 });
  });

  it("ignores readings dated in the future", () => {
    const tomorrow = addCalendarDays(TODAY, 1);
    const withFuture = [
      ...readingSeries(28, () => FLAT_KG),
      { date: tomorrow, weightKg: 70 },
    ];

    const result = measuredBurn(loggedSeries(28, () => CONSTANT_KCAL), withFuture, TODAY);

    // A 10 kg jump tomorrow would wreck the slope if it were counted.
    expect(result).toEqual({
      kind: "measured",
      kcal: CONSTANT_KCAL,
      sigma: 0,
      windowDays: 14,
      loggedDays: 14,
    });
  });

  it("returns both counts when nothing has been logged or weighed", () => {
    expect(measuredBurn([], [], TODAY)).toEqual({ kind: "insufficient", loggedDays: 0, readings: 0 });
  });

  it("names which half is missing when only one source has data", () => {
    expect(measuredBurn(loggedSeries(28, () => CONSTANT_KCAL), [], TODAY)).toEqual({
      kind: "insufficient",
      loggedDays: 28,
      readings: 0,
    });
    expect(measuredBurn([], readingSeries(28, () => FLAT_KG), TODAY)).toEqual({
      kind: "insufficient",
      loggedDays: 0,
      readings: 28,
    });
  });
});
