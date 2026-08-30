import { describe, expect, it, vi } from "vitest";

import { addCalendarDays, dayBoundsInTimezone, localDateStringOf, todayLocalDateString } from "./day-bounds";

describe("addCalendarDays", () => {
  it("rolls over a month boundary going forward", () => {
    expect(addCalendarDays("2026-01-31", 1)).toBe("2026-02-01");
  });

  it("rolls back over a month boundary going backward", () => {
    expect(addCalendarDays("2026-03-01", -1)).toBe("2026-02-28");
  });
});

describe("dayBoundsInTimezone", () => {
  it("computes UTC bounds for a non-whole-hour offset (Asia/Kolkata, UTC+5:30)", () => {
    const bounds = dayBoundsInTimezone("2026-06-15", "Asia/Kolkata");
    expect(bounds.start.toISOString()).toBe("2026-06-14T18:30:00.000Z");
    expect(bounds.end.toISOString()).toBe("2026-06-15T18:30:00.000Z");
  });

  it("computes a 23-hour day across the US spring-forward DST transition", () => {
    // 2026-03-08 is the US DST start (clocks jump 02:00 -> 03:00 EST->EDT),
    // so this local day is 23 hours long - naive `+ 86400000ms` arithmetic
    // would get `end` an hour wrong.
    const bounds = dayBoundsInTimezone("2026-03-08", "America/New_York");
    expect(bounds.start.toISOString()).toBe("2026-03-08T05:00:00.000Z");
    expect(bounds.end.toISOString()).toBe("2026-03-09T04:00:00.000Z");
  });

  it("resolves the correct pre-transition offset for a DST-start date in a positive-offset zone", () => {
    // 2026-10-04 is Australia's DST-start date (Sydney: clocks jump 02:00 -> 03:00
    // AEST->AEDT). Local midnight that day is still AEST (+10), before the
    // transition - a single fixed-sample offset lookup gets this wrong by
    // reading the post-transition AEDT (+11) offset instead.
    const bounds = dayBoundsInTimezone("2026-10-04", "Australia/Sydney");
    expect(bounds.start.toISOString()).toBe("2026-10-03T14:00:00.000Z");
  });
});

describe("localDateStringOf", () => {
  it("returns the local calendar date for an instant, per timezone", () => {
    const instant = new Date("2026-01-01T22:00:00Z");
    expect(localDateStringOf(instant, "UTC")).toBe("2026-01-01");
    expect(localDateStringOf(instant, "Asia/Kolkata")).toBe("2026-01-02"); // UTC+5:30
  });
});

describe("todayLocalDateString", () => {
  it("rolls over to the next local date before UTC midnight in a positive-offset zone", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-15T23:30:00Z"));

    expect(todayLocalDateString("Asia/Kolkata")).toBe("2026-06-16");
    expect(todayLocalDateString("America/New_York")).toBe("2026-06-15");

    vi.useRealTimers();
  });
});
