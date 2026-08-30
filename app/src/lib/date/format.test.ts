import { afterEach, describe, expect, it, vi } from "vitest";

import { formatDayLabel } from "./format";

describe("formatDayLabel", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns 'Today' when date matches now's local calendar date", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 7, 30));

    expect(formatDayLabel("2026-08-30")).toBe("Today");
  });

  it("returns 'Yesterday' when date is one calendar day before now", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 7, 30));

    expect(formatDayLabel("2026-08-29")).toBe("Yesterday");
  });

  it("returns a weekday/day/month label for an older date", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 7, 30));

    expect(formatDayLabel("2026-08-25")).toBe("Tue 25 Aug");
  });
});
