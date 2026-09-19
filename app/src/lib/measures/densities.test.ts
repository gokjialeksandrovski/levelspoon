import { describe, expect, it } from "vitest";

import { isLooseSolid, seededDensity } from "./densities";

describe("seededDensity", () => {
  it("matches a single-word key case-insensitively", () => {
    expect(seededDensity("Organic Honey")).toBe(1.42);
  });

  it("matches a multi-word key against the product name's tokens", () => {
    expect(seededDensity("Organic Rolled Oats")).toBe(0.41);
  });

  it("does not match a substring, so Butterscotch is not butter", () => {
    expect(seededDensity("Butterscotch Sauce")).toBeNull();
  });

  it("prefers the more specific key when one matched key's tokens contain another's", () => {
    expect(seededDensity("Light Brown Sugar")).toBe(0.93);
  });

  it("returns null rather than guessing when two unrelated keys match", () => {
    expect(seededDensity("Butter Milk Blend")).toBeNull();
  });

  it("returns null for a name it does not know", () => {
    expect(seededDensity("Snickers Bar")).toBeNull();
  });
});

describe("isLooseSolid", () => {
  it("is true for a seeded dry good, whose cup weight moves with packing", () => {
    expect(isLooseSolid("Light Brown Sugar")).toBe(true);
    expect(isLooseSolid("Organic Rolled Oats")).toBe(true);
  });

  it("is false for a seeded liquid, whose cup weight does not", () => {
    expect(isLooseSolid("Olive Oil")).toBe(false);
    expect(isLooseSolid("Organic Honey")).toBe(false);
  });

  it("is false for a name with no seeded density at all", () => {
    expect(isLooseSolid("Snickers Bar")).toBe(false);
  });
});
