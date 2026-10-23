import { describe, expect, it } from "vitest";

import { formatDayLabel } from "./format";

describe("formatDayLabel", () => {
  it("returns 'Today' when date matches today", () => {
    expect(formatDayLabel("2026-08-30", "2026-08-30")).toBe("Today");
  });

  it("returns 'Yesterday' when date is one calendar day before today", () => {
    expect(formatDayLabel("2026-08-29", "2026-08-30")).toBe("Yesterday");
  });

  it("returns a weekday/day/month label for an older date", () => {
    expect(formatDayLabel("2026-08-25", "2026-08-30")).toBe("Tue 25 Aug");
  });
});
