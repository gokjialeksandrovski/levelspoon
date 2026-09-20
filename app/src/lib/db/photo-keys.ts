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

// The one place a photo's MIME type becomes its key's file extension - the
// read path (ocr.ts) and the write path (products.ts) must derive the same
// extension from the same photo, or a refusal stops matching what actually
// got stored.
export const extensionFromMimeType = (mimeType: string): string =>
  mimeType === "image/png" ? PNG_EXTENSION : JPEG_EXTENSION;

export interface PhotoKeyPair {
  proofKey: string;
  claimKey: string;
}

// Identical bytes hash to two different keys under the two prefixes (a proof
// photo and a reformulation claim), so anywhere that asks "does anyone
// already hold this photo" must probe both - one shared builder instead of
// each call site re-listing the pair.
export const photoKeysFor = (buffer: Buffer, extension: string): PhotoKeyPair => ({
  proofKey: toPhotoKey(buffer, PROOF_PHOTO_PREFIX, extension),
  claimKey: toPhotoKey(buffer, CLAIM_PHOTO_PREFIX, extension),
});
