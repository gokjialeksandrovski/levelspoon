import { describe, expect, it } from "vitest";

import { monthLabel, toHistoryMonths, weekSummary, withUnloggedDays } from "./history.utils";

const logged = (date: string, totalKcal = 2000) => ({ date, totalKcal });

describe("withUnloggedDays", () => {
  it("leaves consecutive days alone", () => {
    const rows = withUnloggedDays([logged("2026-09-23"), logged("2026-09-22")]);
    expect(rows.map((row) => row.kind)).toEqual(["logged", "logged"]);
  });

  it("puts a skipped day back between two logged ones", () => {
    const rows = withUnloggedDays([logged("2026-09-23"), logged("2026-09-21")]);
    expect(rows).toEqual([
      { kind: "logged", date: "2026-09-23", totalKcal: 2000 },
      { kind: "unlogged", date: "2026-09-22" },
      { kind: "logged", date: "2026-09-21", totalKcal: 2000 },
    ]);
  });

  it("collapses a stretch longer than a week into one row", () => {
    const rows = withUnloggedDays([logged("2026-09-23"), logged("2026-09-10")]);
    expect(rows[1]).toEqual({ kind: "gap", date: "2026-09-22", days: 12 });
    expect(rows).toHaveLength(3);
  });

  it("fills a six-day stretch day by day, the longest that stays a list", () => {
    const rows = withUnloggedDays([logged("2026-09-23"), logged("2026-09-16")]);
    expect(rows.filter((row) => row.kind === "unlogged")).toHaveLength(6);
  });

  // The page above the newest row is the day the user just came from, and the
  // page below the oldest may still be loading.
  it("never fills beyond the loaded entries", () => {
    const rows = withUnloggedDays([logged("2026-09-20")]);
    expect(rows).toEqual([{ kind: "logged", date: "2026-09-20", totalKcal: 2000 }]);
  });

  it("crosses a month boundary", () => {
    const rows = withUnloggedDays([logged("2026-09-02"), logged("2026-08-31")]);
    expect(rows[1]).toEqual({ kind: "unlogged", date: "2026-09-01" });
  });
});

describe("toHistoryMonths", () => {
  it("cuts the rows where the month changes", () => {
    const months = toHistoryMonths([logged("2026-09-01"), logged("2026-08-31")], "2026-09-23");
    expect(months.map((month) => month.key)).toEqual(["2026-09", "2026-08"]);
    expect(months.map((month) => month.rows.length)).toEqual([1, 1]);
  });

  it("keeps one month as one section", () => {
    const months = toHistoryMonths([logged("2026-09-23"), logged("2026-09-22")], "2026-09-23");
    expect(months).toHaveLength(1);
    expect(months[0].rows).toHaveLength(2);
  });
});

describe("monthLabel", () => {
  it("drops the year inside the current one", () => {
    expect(monthLabel("2026-09-23", "2026-09-23")).toBe("September");
  });

  it("states the year once the list leaves it", () => {
    expect(monthLabel("2025-12-31", "2026-09-23")).toBe("December 2025");
  });
});

describe("weekSummary", () => {
  it("averages the logged days of the week before today", () => {
    const summary = weekSummary([logged("2026-09-22", 2000), logged("2026-09-20", 1000)], "2026-09-23", true);
    expect(summary?.loggedDays).toBe(2);
    expect(summary?.averageKcal).toBe(1500);
    expect(summary?.days).toHaveLength(7);
  });

  it("lists the week oldest first, blank days as null", () => {
    const summary = weekSummary([logged("2026-09-22", 2000), logged("2026-09-20", 1000)], "2026-09-23", true);
    expect(summary?.days.slice(-3)).toEqual([
      { date: "2026-09-20", kcal: 1000 },
      { date: "2026-09-21", kcal: null },
      { date: "2026-09-22", kcal: 2000 },
    ]);
  });

  // A day still being eaten is not a day's eating.
  it("leaves today out", () => {
    const summary = weekSummary([logged("2026-09-23", 200), logged("2026-09-22", 2000), logged("2026-09-21", 1000)], "2026-09-23", true);
    expect(summary?.averageKcal).toBe(1500);
    expect(summary?.days.map((day) => day.date)).not.toContain("2026-09-23");
  });

  it("reads no further back than a week", () => {
    const entries = Array.from({ length: 10 }, (_, index) => logged(`2026-09-${String(22 - index).padStart(2, "0")}`, 2000));
    expect(weekSummary(entries, "2026-09-23", false)?.loggedDays).toBe(7);
  });

  // Days before the first log were not missed; the app was not in use yet.
  it("starts at the first day ever logged", () => {
    const summary = weekSummary([logged("2026-09-22"), logged("2026-09-20")], "2026-09-23", false);
    expect(summary?.days.map((day) => day.date)).toEqual(["2026-09-20", "2026-09-21", "2026-09-22"]);
  });

  it("refuses to call a single day an average", () => {
    expect(weekSummary([logged("2026-09-22")], "2026-09-23", true)).toBeNull();
  });
});
