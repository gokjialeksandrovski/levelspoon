import { describe, expect, it } from "vitest";

import { fitWithin } from "./downscale";

describe("fitWithin", () => {
  it("scales a landscape photo so its width is the max edge", () => {
    expect(fitWithin({ width: 4000, height: 3000 }, 2048)).toEqual({ width: 2048, height: 1536 });
  });

  it("scales a portrait photo so its height is the max edge", () => {
    expect(fitWithin({ width: 3000, height: 4000 }, 2048)).toEqual({ width: 1536, height: 2048 });
  });

  it("keeps a photo already inside the max edge at its size", () => {
    expect(fitWithin({ width: 800, height: 600 }, 2048)).toEqual({ width: 800, height: 600 });
  });
});
