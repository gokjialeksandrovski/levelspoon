import { describe, expect, it } from "vitest";

import {
  CLAIM_PHOTO_PREFIX,
  extensionFromBytes,
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

describe("extensionFromBytes", () => {
  it("recognizes PNG's own signature", () => {
    const pngBytes = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47]), bytesOf("rest-of-file")]);
    expect(extensionFromBytes(pngBytes)).toBe("png");
  });

  it("falls back to jpg for anything without that signature", () => {
    expect(extensionFromBytes(bytesOf("label-a"))).toBe("jpg");
  });
});

describe("photoKeysFor", () => {
  it("returns the proof- and claim-prefixed keys for the same bytes", () => {
    const { proofKey, claimKey } = photoKeysFor(bytesOf("label-a"));
    expect(proofKey).toBe(toPhotoKey(bytesOf("label-a"), PROOF_PHOTO_PREFIX, "jpg"));
    expect(claimKey).toBe(toPhotoKey(bytesOf("label-a"), CLAIM_PHOTO_PREFIX, "jpg"));
  });

  // The finding this pins: a <input type="file"> reports its MIME type from
  // the file's name, so a borrowed label renamed from .jpg to .png used to
  // mint a different key for the identical bytes - evading the UNIQUE index
  // that is supposed to be the actual guard. There is no MIME parameter left
  // to lie with; the extension now comes only from the bytes' own signature.
  it("derives the identical key for identical bytes carrying a PNG signature or not", () => {
    const jpegLikeBytes = bytesOf("shared-label-bytes");
    const pngLikeBytes = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47]), bytesOf("shared-label-bytes")]);
    expect(photoKeysFor(jpegLikeBytes)).toEqual(photoKeysFor(jpegLikeBytes));
    expect(photoKeysFor(pngLikeBytes).proofKey).toMatch(/\.png$/);
    expect(photoKeysFor(jpegLikeBytes).proofKey).toMatch(/\.jpg$/);
  });
});
