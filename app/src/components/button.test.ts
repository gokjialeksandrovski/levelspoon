import { describe, expect, it } from "vitest";

import { buttonClassName } from "./button";

describe("buttonClassName", () => {
  it("no longer references the retired accent tokens", () => {
    const primary = buttonClassName("primary");
    expect(primary).not.toMatch(/accent-ink|bg-accent\b/);
  });

  it("uses the neutral ink-on-surface treatment for the primary variant", () => {
    const primary = buttonClassName("primary");
    expect(primary).toContain("bg-text");
    expect(primary).toContain("text-bg");
  });

  it("gives the fat variant the plum cooking-materials accent, not a hardcoded hex", () => {
    const fat = buttonClassName("fat");
    expect(fat).toContain("text-accent-fat");
    expect(fat).toContain("border-accent-fat");
  });
});
