import { afterEach, describe, expect, it, vi } from "vitest";

import { triggerLogSuccessHaptic } from "./log-success";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("triggerLogSuccessHaptic", () => {
  it("calls navigator.vibrate with the dual-tap pattern when supported", () => {
    const vibrate = vi.fn();
    vi.stubGlobal("navigator", { vibrate });

    triggerLogSuccessHaptic();

    expect(vibrate).toHaveBeenCalledTimes(1);
    expect(vibrate.mock.calls[0][0]).toEqual(expect.any(Array));
  });

  it("does not throw when navigator.vibrate is unsupported (iOS Safari)", () => {
    vi.stubGlobal("navigator", {});

    expect(() => triggerLogSuccessHaptic()).not.toThrow();
  });

  it("does not throw when navigator itself is unavailable", () => {
    vi.stubGlobal("navigator", undefined);

    expect(() => triggerLogSuccessHaptic()).not.toThrow();
  });
});
