import { describe, expect, it } from "vitest";

import { toLikeTokens } from "./like-tokens";

describe("toLikeTokens", () => {
  it("splits on whitespace and drops empties", () => {
    expect(toLikeTokens("  bella   yogurt ")).toEqual(["bella", "yogurt"]);
  });

  it("escapes LIKE metacharacters so a typed % is a literal %", () => {
    expect(toLikeTokens("2,8%")).toEqual(["2,8\\%"]);
    expect(toLikeTokens("m_m")).toEqual(["m\\_m"]);
  });

  it("escapes the escape character itself before the metacharacters", () => {
    expect(toLikeTokens("a\\b")).toEqual(["a\\\\b"]);
  });

  it("returns an empty list for a blank query", () => {
    expect(toLikeTokens("   ")).toEqual([]);
  });
});
