import { describe, expect, it, vi } from "vitest";

vi.stubEnv("QUANTITY_PROVIDER", "mock");

import { estimateQuantity } from "./quantity";

describe("estimateQuantity", () => {
  it("returns a positive gram estimate from the mock provider", async () => {
    const result = await estimateQuantity(new Blob([Buffer.from("fake-photo-bytes")]));
    expect(result.grams).toBeGreaterThan(0);
  });
});
