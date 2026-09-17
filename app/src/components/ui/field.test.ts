import { describe, expect, it } from "vitest";

import { contrastRatio } from "@/lib/theme/contrast";

import { fieldInputClassName } from "./field";

describe("fieldInputClassName", () => {
  it("uses the plain border color when neither flagged nor errored", () => {
    expect(fieldInputClassName(false, undefined)).toContain("border-text-muted");
    expect(fieldInputClassName(false, undefined)).not.toContain("border-flag");
  });

  it("switches to the flag border color when flagged", () => {
    expect(fieldInputClassName(true, undefined)).toContain("border-flag");
  });

  it("switches to the flag border color when an error is present, even unflagged", () => {
    expect(fieldInputClassName(false, "Required")).toContain("border-flag");
  });

  // A read-only field is not a disabled one, so it must not borrow the
  // disabled recipe's 50% opacity - see the contrast assertion below.
  it("mutes a read-only field's ink and drops its control outline to divider weight", () => {
    const readOnly = fieldInputClassName(false, undefined, true);
    expect(readOnly).toContain("text-text-muted");
    expect(readOnly).toContain("bg-surface-raised");
    expect(readOnly).toContain("border-border");
    expect(readOnly).not.toContain("opacity-50");
  });

  it("keeps a flagged read-only field on the flag border", () => {
    expect(fieldInputClassName(true, undefined, true)).toContain("border-flag");
  });
});

// WCAG 2.2 exempts inactive components from 1.4.3; a readOnly input is not
// inactive, so its muted ink has to clear 4.5:1 on the raised mat it sits on,
// in both themes. Hexes are globals.css's --raw-text-muted / --raw-surface-raised.
describe("the read-only field's muted ink", () => {
  const AA_NORMAL_TEXT = 4.5;

  it("clears WCAG AA against the raised surface in both themes", () => {
    expect(contrastRatio("#9c9488", "#262320")).toBeGreaterThan(AA_NORMAL_TEXT);
    expect(contrastRatio("#6b6459", "#f5f2ea")).toBeGreaterThan(AA_NORMAL_TEXT);
  });
});
