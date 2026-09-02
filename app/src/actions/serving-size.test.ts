import { describe, expect, it, vi } from "vitest";

vi.stubEnv("SERVING_SIZE_PROVIDER", "mock");
vi.mock("@/auth", () => ({ auth: () => Promise.resolve({ user: { id: crypto.randomUUID() } }) }));

import { convertServingSize } from "./serving-size";

describe("convertServingSize", () => {
  it("returns a positive gram estimate from the mock provider", async () => {
    const result = await convertServingSize("2 Tablespoon", "Peanut Butter");
    expect(result.grams).toBeGreaterThan(0);
  });
});
