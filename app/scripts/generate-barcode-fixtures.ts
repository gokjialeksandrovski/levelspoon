import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { readBarcodes } from "zxing-wasm/reader";
import { writeBarcode } from "zxing-wasm/writer";

// Real, decodable fixtures - not stub images. Barcode decoding runs through
// the actual ZXing WASM reader even when BARCODE_LOOKUP_PROVIDER is mocked,
// so a blank/fake image would never exercise the real decode path (spec §11).
const BARCODE_VALUE = "5901234123457";
const FIXTURES_DIR = fileURLToPath(new URL("../../fixtures/barcodes/", import.meta.url));
const PNG_PATH = `${FIXTURES_DIR}product-barcode.png`;

const BARCODE_SCALE = 2;

// writeBarcode's PNG is the ground truth; round-tripping it through the same
// package's own reader (a different API surface than the app's
// barcode-detector wrapper, but the same underlying decoder) fails loudly if
// this ever generates an unreadable fixture instead of committing a bad one.
const generateBarcodePng = async (value: string, outPath: string): Promise<void> => {
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
};

// One PNG per e2e scenario that needs a distinct decoded value.
// Values verified valid (correct GTIN check digit) and non-restricted via
// normalizeBarcode's own algorithm before being committed here.
const EXTRA_PNG_FIXTURES: { value: string; filename: string }[] = [
  { value: "4006381333931", filename: "external-match-barcode.png" },
  { value: "0000000000000", filename: "not-found-barcode.png" },
  { value: "2012345678903", filename: "restricted-barcode.png" },
];

(async () => {
  await mkdir(FIXTURES_DIR, { recursive: true });
  await generateBarcodePng(BARCODE_VALUE, PNG_PATH);
  console.log(`Wrote ${PNG_PATH}`);
  for (const fixture of EXTRA_PNG_FIXTURES) {
    const outPath = `${FIXTURES_DIR}${fixture.filename}`;
    await generateBarcodePng(fixture.value, outPath);
    console.log(`Wrote ${outPath}`);
  }
})();
