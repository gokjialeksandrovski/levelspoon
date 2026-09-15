import { describe, expect, it } from "vitest";

import { MOCK_NOT_FOUND_BARCODE, MockBarcodeLookupProvider } from "./mock-lookup-provider";

describe("MockBarcodeLookupProvider", () => {
  it("returns a canned found match for any other barcode", async () => {
    const result = await new MockBarcodeLookupProvider().lookup("4000000000006");
    expect(result.kind).toBe("found");
    if (result.kind === "found") {
      expect(result.match.nameGuess).toBe("Mock Product");
    }
  });

  it("returns not_found for the reserved sentinel barcode", async () => {
    const result = await new MockBarcodeLookupProvider().lookup(MOCK_NOT_FOUND_BARCODE);
    expect(result).toEqual({ kind: "not_found" });
  });
});
