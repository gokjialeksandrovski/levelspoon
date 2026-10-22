export class UnsupportedImageFormatError extends Error {
  constructor(leadingBytesHex: string) {
    super(`Unsupported image format; leading bytes were 0x${leadingBytesHex}`);
    this.name = "UnsupportedImageFormatError";
  }
}

// Enough bytes to cover the longest signature we check (WebP's format tag
// sits at byte 8), read as hex so matching needs no byte arithmetic.
const HEADER_BYTES = 12;

// WebP is "RIFF" + a 4-byte size + "WEBP", so the format tag starts at
// byte 8 - hex character 16.
const WEBP_FORMAT_TAG_HEX_OFFSET = 16;

// Gemini's inline image parts accept these three formats. The browser's
// Blob.type is deliberately not trusted: it is frequently empty for camera
// captures.
const IMAGE_SIGNATURES = [
  { mimeType: "image/jpeg", matches: (header: string) => header.startsWith("ffd8ff") },
  { mimeType: "image/png", matches: (header: string) => header.startsWith("89504e47") },
  {
    mimeType: "image/webp",
    matches: (header: string) =>
      header.startsWith("52494646") &&
      header.startsWith("57454250", WEBP_FORMAT_TAG_HEX_OFFSET),
  },
];

export const imageMimeType = (photo: Buffer): string => {
  const header = photo.subarray(0, HEADER_BYTES).toString("hex");
  const signature = IMAGE_SIGNATURES.find(({ matches }) => matches(header));
  if (!signature) {
    throw new UnsupportedImageFormatError(header);
  }
  return signature.mimeType;
};
