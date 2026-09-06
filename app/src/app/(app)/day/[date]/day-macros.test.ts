// app/src/app/(app)/day/[date]/day-macros.test.ts
//
// This repo doesn't render components in tests (vitest runs in a node
// environment, no jsdom - see vitest.config.ts). This test instead locks in
// the type-size mapping function that DayMacros' JSX will call, so the
// visual rule ("larger share -> larger type") is verified without a DOM.
import { describe, expect, it } from "vitest";

import { macroFigureSizeClass } from "./day-macros";

describe("macroFigureSizeClass", () => {
  it("returns a larger size class for a larger calorie share", () => {
    const dominant = macroFigureSizeClass(0.6);
    const minor = macroFigureSizeClass(0.15);
    // Tailwind's text-* scale is alphabetically-unordered by name, so
    // compare against the known ordered set used by SIZE_STEPS rather than
    // string-comparing the class names themselves.
    const order = ["text-lg", "text-xl", "text-2xl", "text-3xl", "text-4xl"];
    expect(order.indexOf(dominant)).toBeGreaterThan(order.indexOf(minor));
  });

  it("never returns a class small enough to be illegible (legibility floor)", () => {
    const nearZero = macroFigureSizeClass(0.02);
    const order = ["text-lg", "text-xl", "text-2xl", "text-3xl", "text-4xl"];
    expect(order).toContain(nearZero);
    expect(order.indexOf(nearZero)).toBeGreaterThanOrEqual(0);
  });

  it("returns the smallest size at a near-zero share", () => {
    expect(macroFigureSizeClass(0.02)).toBe("text-lg");
  });

  it("returns the largest size when one macro is effectively the entire day", () => {
    expect(macroFigureSizeClass(1)).toBe("text-4xl");
  });
});
