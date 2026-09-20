import { createHash } from "node:crypto";

// The key IS the content hash, so identical bytes cannot become two objects and
// a UNIQUE index on the key column is what forbids two products sharing one
// label photo (spec §3). Nothing may mint a photo key any other way.
export const toPhotoKey = (buffer: Buffer, prefix: string, extension: string): string =>
  `${prefix}/${createHash("sha256").update(buffer).digest("hex")}.${extension}`;

export const PROOF_PHOTO_PREFIX = "products";
// Kept apart from proof photos so a reviewer working the photo-debt report can
// tell, from the key alone, which object is the unverified claim.
export const CLAIM_PHOTO_PREFIX = "product-claims";

const PNG_EXTENSION = "png";
const JPEG_EXTENSION = "jpg";
// PNG's magic number, as hex rather than a byte array - a numeric literal
// array trips the no-magic-numbers lint four times over for one constant.
const PNG_SIGNATURE = Buffer.from("89504e47", "hex");

// Sniffed from the bytes, never from a caller-declared MIME type: a browser
// <input type="file"> reports the type from the file's name, so a renamed
// file (borrowed-label.jpg saved as .png) would otherwise mint a second key
// for bytes the UNIQUE index already holds under the first one - the
// extension has to be canonical for the index to be the actual guard.
// Everything but PNG's own signature is treated as jpg, matching the old
// MIME-based default.
export const extensionFromBytes = (buffer: Buffer): string =>
  buffer.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE) ? PNG_EXTENSION : JPEG_EXTENSION;

export interface PhotoKeyPair {
  proofKey: string;
  claimKey: string;
}

// Identical bytes hash to two different keys under the two prefixes (a proof
// photo and a reformulation claim), so anywhere that asks "does anyone
// already hold this photo" must probe both - one shared builder instead of
// each call site re-listing the pair. Extension is derived here too, so a
// caller can never pass one that disagrees with what actually gets stored.
export const photoKeysFor = (buffer: Buffer): PhotoKeyPair => {
  const extension = extensionFromBytes(buffer);
  return {
    proofKey: toPhotoKey(buffer, PROOF_PHOTO_PREFIX, extension),
    claimKey: toPhotoKey(buffer, CLAIM_PHOTO_PREFIX, extension),
  };
};
