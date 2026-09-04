import { describe, expect, it } from "vitest";

import { fieldInputClassName } from "./field";

describe("fieldInputClassName", () => {
  it("uses the plain border color when neither flagged nor errored", () => {
    expect(fieldInputClassName(false, undefined)).toContain("border-border");
    expect(fieldInputClassName(false, undefined)).not.toContain("border-flag");
  });

  it("switches to the flag border color when flagged", () => {
    expect(fieldInputClassName(true, undefined)).toContain("border-flag");
  });

  it("switches to the flag border color when an error is present, even unflagged", () => {
    expect(fieldInputClassName(false, "Required")).toContain("border-flag");
  });
});
