import { describe, expect, it } from "vitest";

import { parseTypedBarcode } from "./typed-barcode.utils";

describe("parseTypedBarcode", () => {
  it("accepts the digits with the gaps a package prints between them", () => {
    expect(parseTypedBarcode(" 5 901234-123457 ")).toEqual({ kind: "ok", barcode: "5901234123457" });
  });

  it("canonicalises a UPC-A code to EAN-13, same as a scan", () => {
    expect(parseTypedBarcode("036000291452")).toEqual({ kind: "ok", barcode: "0036000291452" });
  });

  it.each([
    ["", /first/],
    ["   ", /first/],
    ["59012341234", /8, 12 or 13 digits/],
    ["59O1234123457", /8, 12 or 13 digits/],
    ["5901234123458", /aren't a valid barcode/],
    ["2000000000008", /shop's own code/],
  ])("refuses %j with a message naming the fix", (typed, message) => {
    const result = parseTypedBarcode(typed);
    expect(result.kind === "refused" && result.message).toMatch(message);
  });
});
