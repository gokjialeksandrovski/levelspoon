import { describe, expect, it } from "vitest";

import { CLAIM_PHOTO_PREFIX, PROOF_PHOTO_PREFIX, toPhotoKey } from "./photo-keys";

const bytesOf = (text: string): Buffer => Buffer.from(text, "utf8");

describe("toPhotoKey", () => {
  it("derives the same key from the same bytes", () => {
    const first = toPhotoKey(bytesOf("label-a"), PROOF_PHOTO_PREFIX, "jpg");
    const second = toPhotoKey(bytesOf("label-a"), PROOF_PHOTO_PREFIX, "jpg");
    expect(second).toBe(first);
  });

  it("derives different keys from different bytes", () => {
    const first = toPhotoKey(bytesOf("label-a"), PROOF_PHOTO_PREFIX, "jpg");
    const second = toPhotoKey(bytesOf("label-b"), PROOF_PHOTO_PREFIX, "jpg");
    expect(second).not.toBe(first);
  });

  it("keeps the same bytes apart under the proof and claim prefixes", () => {
    const proof = toPhotoKey(bytesOf("label-a"), PROOF_PHOTO_PREFIX, "jpg");
    const claim = toPhotoKey(bytesOf("label-a"), CLAIM_PHOTO_PREFIX, "jpg");
    expect(proof).not.toBe(claim);
    expect(proof.startsWith("products/")).toBe(true);
    expect(claim.startsWith("product-claims/")).toBe(true);
  });

  it("is a 64-character hex digest under the prefix", () => {
    expect(toPhotoKey(bytesOf("label-a"), PROOF_PHOTO_PREFIX, "png")).toMatch(
      /^products\/[0-9a-f]{64}\.png$/,
    );
  });
});
