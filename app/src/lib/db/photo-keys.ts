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
