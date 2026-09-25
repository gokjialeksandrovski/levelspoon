import { describe, expect, it } from "vitest";

import { imageMimeType, UnsupportedImageFormatError } from "./image-mime-type";

// Minimal real file headers. Only the signature bytes matter; the trailing
// bytes are padding so the 12-byte header window is always full.
const jpegHeader = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0]);
const pngHeader = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
// "RIFF" + 4-byte little-endian size + "WEBP"
const webpHeader = Buffer.concat([
  Buffer.from("RIFF", "ascii"),
  Buffer.from([0x24, 0, 0, 0]),
  Buffer.from("WEBP", "ascii"),
]);

describe("imageMimeType", () => {
  it("detects a JPEG from its magic bytes", () => {
    expect(imageMimeType(jpegHeader)).toBe("image/jpeg");
  });

  it("detects a PNG from its magic bytes", () => {
    expect(imageMimeType(pngHeader)).toBe("image/png");
  });

  it("detects a WebP from its RIFF container tag", () => {
    expect(imageMimeType(webpHeader)).toBe("image/webp");
  });

  it("throws UnsupportedImageFormatError naming the leading bytes", () => {
    const notAnImage = Buffer.from("this is plain text", "ascii");

    expect(() => imageMimeType(notAnImage)).toThrow(UnsupportedImageFormatError);
    expect(() => imageMimeType(notAnImage)).toThrow(/74686973/);
  });
});
