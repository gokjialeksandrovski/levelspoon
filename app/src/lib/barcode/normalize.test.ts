import { describe, expect, it } from "vitest";

import { normalizeBarcode } from "./normalize";

describe("normalizeBarcode", () => {
  it("accepts a valid 13-digit EAN-13 as-is", () => {
    expect(normalizeBarcode("5901234123457")).toEqual({ kind: "ok", barcode: "5901234123457" });
  });

  it("rejects a bad check digit", () => {
    expect(normalizeBarcode("5901234123458")).toEqual({ kind: "invalid_check_digit" });
  });

  it("canonicalizes a valid 12-digit UPC-A to EAN-13 with a leading 0", () => {
    expect(normalizeBarcode("012345678905")).toEqual({ kind: "ok", barcode: "0012345678905" });
  });

  it("expands a valid 8-digit UPC-E through UPC-A to EAN-13", () => {
    expect(normalizeBarcode("02345659")).toEqual({ kind: "ok", barcode: "0023456000059" });
  });

  it("rejects a restricted-circulation prefix (20-29 range) before it would look like a normal product", () => {
    expect(normalizeBarcode("2012345678903")).toEqual({ kind: "restricted_circulation" });
  });

  it("rejects a wrong-length digit string", () => {
    expect(normalizeBarcode("1234567")).toEqual({ kind: "invalid_format" });
  });

  it("rejects a non-digit string", () => {
    expect(normalizeBarcode("590123412345X")).toEqual({ kind: "invalid_format" });
  });
});
