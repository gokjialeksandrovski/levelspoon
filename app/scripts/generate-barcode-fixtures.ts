import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { PNG } from "pngjs";
import { readBarcodes } from "zxing-wasm/reader";
import { writeBarcode } from "zxing-wasm/writer";

// Real, decodable fixtures - not stub images. Barcode decoding runs through
// the actual ZXing WASM reader even when BARCODE_LOOKUP_PROVIDER is mocked,
// so a blank/fake image would never exercise the real decode path (spec §11).
const BARCODE_VALUE = "5901234123457";
const FIXTURES_DIR = fileURLToPath(new URL("../../fixtures/barcodes/", import.meta.url));
const PNG_PATH = `${FIXTURES_DIR}product-barcode.png`;
const Y4M_PATH = `${FIXTURES_DIR}product-barcode.y4m`;

const BARCODE_SCALE = 2;
const FRAME_WIDTH = 320;
const FRAME_HEIGHT = 240;
const FRAME_COUNT = 10;
const FRAME_RATE_FPS = 5;

// RGBA indices for pixel data
const RGBA_R = 0;
const RGBA_G = 1;
const RGBA_B = 2;
const RGBA_SIZE = 4;

// RGB indices for raw RGB data
const RGB_R = 0;
const RGB_G = 1;
const RGB_B = 2;
const RGB_SIZE = 3;

// ITU-R BT.601 full-range RGB -> YCbCr coefficients (y4m's C420jpeg tag).
const LUMA_R = 0.299;
const LUMA_G = 0.587;
const LUMA_B = 0.114;
const CB_R = -0.168736;
const CB_G = -0.331264;
const CB_B = 0.5;
const CR_R = 0.5;
const CR_G = -0.418688;
const CR_B = -0.081312;
const CHROMA_MIDPOINT = 128;
const BYTE_MAX = 255;

const clampByte = (value: number): number => Math.max(0, Math.min(BYTE_MAX, Math.round(value)));
const rgbToY = (r: number, g: number, b: number): number => clampByte(LUMA_R * r + LUMA_G * g + LUMA_B * b);
const rgbToU = (r: number, g: number, b: number): number => clampByte(CB_R * r + CB_G * g + CB_B * b + CHROMA_MIDPOINT);
const rgbToV = (r: number, g: number, b: number): number => clampByte(CR_R * r + CR_G * g + CR_B * b + CHROMA_MIDPOINT);

// writeBarcode's PNG is the ground truth; round-tripping it through the same
// package's own reader (a different API surface than the component's
// barcode-detector wrapper, but the same underlying decoder) fails loudly if
// this ever generates an unreadable fixture instead of committing a bad one.
const generateBarcodePng = async (value: string, outPath: string): Promise<InstanceType<typeof PNG>> => {
  const { image, error } = await writeBarcode(value, { format: "EAN13", scale: BARCODE_SCALE });
  if (!image) {
    throw new Error(`writeBarcode failed: ${error}`);
  }
  const buffer = Buffer.from(await image.arrayBuffer());
  const [decoded] = await readBarcodes(buffer);
  if (decoded?.text !== value) {
    throw new Error(`Round-trip decode mismatch: expected ${value}, got ${decoded?.text}`);
  }
  await writeFile(outPath, buffer);
  return PNG.sync.read(buffer);
};

// One PNG per T3 e2e scenario that needs a distinct decoded value (Chromium's
// fake-video-capture flag is fixed for the whole Playwright project, so only
// the photo-upload path can exercise these - see barcode-wizard.spec.ts).
// Values verified valid (correct GTIN check digit) and non-restricted via
// normalizeBarcode's own algorithm before being committed here.
const EXTRA_PNG_FIXTURES: { value: string; filename: string }[] = [
  { value: "4006381333931", filename: "external-match-barcode.png" },
  { value: "0000000000000", filename: "not-found-barcode.png" },
  { value: "2012345678903", filename: "restricted-barcode.png" },
];

// White canvas, barcode centered - a real camera frame isn't borderless
// either, so this mirrors a phone photographing a label.
const paintCentered = (png: InstanceType<typeof PNG>): Uint8ClampedArray => {
  const canvas = new Uint8ClampedArray(FRAME_WIDTH * FRAME_HEIGHT * RGB_SIZE).fill(BYTE_MAX);
  const offsetX = Math.floor((FRAME_WIDTH - png.width) / 2);
  const offsetY = Math.floor((FRAME_HEIGHT - png.height) / 2);
  for (let y = 0; y < png.height; y++) {
    for (let x = 0; x < png.width; x++) {
      const destX = offsetX + x;
      const destY = offsetY + y;
      if (destX < 0 || destX >= FRAME_WIDTH || destY < 0 || destY >= FRAME_HEIGHT) {
        continue;
      }
      const src = (png.width * y + x) * RGBA_SIZE;
      const dest = (FRAME_WIDTH * destY + destX) * RGB_SIZE;
      canvas[dest + RGB_R] = png.data[src + RGBA_R];
      canvas[dest + RGB_G] = png.data[src + RGBA_G];
      canvas[dest + RGB_B] = png.data[src + RGBA_B];
    }
  }
  return canvas;
};

// The source is pure black/white so chroma is flat 128 regardless of
// subsampling method - nearest-neighbour loses nothing here.
const fillLumaPlane = (frame: Uint8Array, rgb: Uint8ClampedArray): void => {
  for (let y = 0; y < FRAME_HEIGHT; y++) {
    for (let x = 0; x < FRAME_WIDTH; x++) {
      const i = (FRAME_WIDTH * y + x) * RGB_SIZE;
      frame[FRAME_WIDTH * y + x] = rgbToY(rgb[i + RGB_R], rgb[i + RGB_G], rgb[i + RGB_B]);
    }
  }
};

const CHROMA_SCALE = 2;

const fillChromaPlanes = (frame: Uint8Array, rgb: Uint8ClampedArray, ySize: number, chromaWidth: number, chromaHeight: number): void => {
  const uOffset = ySize;
  const vOffset = ySize + chromaWidth * chromaHeight;
  for (let cy = 0; cy < chromaHeight; cy++) {
    for (let cx = 0; cx < chromaWidth; cx++) {
      const i = (FRAME_WIDTH * (cy * CHROMA_SCALE) + cx * CHROMA_SCALE) * RGB_SIZE;
      frame[uOffset + chromaWidth * cy + cx] = rgbToU(rgb[i + RGB_R], rgb[i + RGB_G], rgb[i + RGB_B]);
      frame[vOffset + chromaWidth * cy + cx] = rgbToV(rgb[i + RGB_R], rgb[i + RGB_G], rgb[i + RGB_B]);
    }
  }
};

const SUBSAMPLING_FACTOR = 2;
const CHROMA_PLANES = 2;

const toI420Frame = (rgb: Uint8ClampedArray): Uint8Array => {
  const ySize = FRAME_WIDTH * FRAME_HEIGHT;
  const chromaWidth = FRAME_WIDTH / SUBSAMPLING_FACTOR;
  const chromaHeight = FRAME_HEIGHT / SUBSAMPLING_FACTOR;
  const frame = new Uint8Array(ySize + chromaWidth * chromaHeight * CHROMA_PLANES);
  fillLumaPlane(frame, rgb);
  fillChromaPlanes(frame, rgb, ySize, chromaWidth, chromaHeight);
  return frame;
};

const writeY4m = async (png: InstanceType<typeof PNG>): Promise<void> => {
  const frame = toI420Frame(paintCentered(png));
  const header = Buffer.from(`YUV4MPEG2 W${FRAME_WIDTH} H${FRAME_HEIGHT} F${FRAME_RATE_FPS}:1 Ip A1:1 C420jpeg\n`, "ascii");
  const frameHeader = Buffer.from("FRAME\n", "ascii");
  const chunks = [header];
  for (let i = 0; i < FRAME_COUNT; i++) {
    chunks.push(frameHeader, Buffer.from(frame));
  }
  await writeFile(Y4M_PATH, Buffer.concat(chunks));
};

(async () => {
  await mkdir(FIXTURES_DIR, { recursive: true });
  const png = await generateBarcodePng(BARCODE_VALUE, PNG_PATH);
  await writeY4m(png);
  console.log(`Wrote ${PNG_PATH}`);
  console.log(`Wrote ${Y4M_PATH}`);
  for (const fixture of EXTRA_PNG_FIXTURES) {
    const outPath = `${FIXTURES_DIR}${fixture.filename}`;
    await generateBarcodePng(fixture.value, outPath);
    console.log(`Wrote ${outPath}`);
  }
})();
