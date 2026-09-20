import { describe, expect, it } from "vitest";

import {
  CLAIM_PHOTO_PREFIX,
  extensionFromMimeType,
  photoKeysFor,
  PROOF_PHOTO_PREFIX,
  toPhotoKey,
} from "./photo-keys";

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

describe("extensionFromMimeType", () => {
  it("maps image/png to png", () => {
    expect(extensionFromMimeType("image/png")).toBe("png");
  });

  it("maps every other MIME type to jpg", () => {
    expect(extensionFromMimeType("image/jpeg")).toBe("jpg");
    expect(extensionFromMimeType("application/octet-stream")).toBe("jpg");
  });
});

describe("photoKeysFor", () => {
  it("returns the proof- and claim-prefixed keys for the same bytes", () => {
    const { proofKey, claimKey } = photoKeysFor(bytesOf("label-a"), "jpg");
    expect(proofKey).toBe(toPhotoKey(bytesOf("label-a"), PROOF_PHOTO_PREFIX, "jpg"));
    expect(claimKey).toBe(toPhotoKey(bytesOf("label-a"), CLAIM_PHOTO_PREFIX, "jpg"));
  });
});
