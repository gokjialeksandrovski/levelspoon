import type { BarcodeDetector as BarcodeDetectorApi } from "barcode-detector/ponyfill";

const WASM_PUBLIC_PATH = "/zxing";

// .wasm copied from node_modules/zxing-wasm@3.1.3's dist/reader/ into
// public/zxing/ - re-copy after any barcode-detector / zxing-wasm version
// bump. Self-hosted so a CDN outage can't break scanning.
const locateWasm = (path: string, prefix: string): string =>
  path.endsWith(".wasm") ? `${WASM_PUBLIC_PATH}/${path}` : prefix + path;

// Lazy import: the ~1MB WASM only loads once a scan is actually requested,
// never on first page load.
const loadDetector = async (): Promise<BarcodeDetectorApi> => {
  const { BarcodeDetector, prepareZXingModule } = await import("barcode-detector/ponyfill");
  prepareZXingModule({ overrides: { locateFile: locateWasm } });
  return new BarcodeDetector({ formats: ["retail_codes"] });
};

const SCANNER_LOAD_ERROR_MESSAGE = "Couldn't load the barcode scanner. Try again in a moment.";
const NO_BARCODE_FOUND_MESSAGE = "No barcode found in that photo. Try again with the code centered and in focus.";

// A photo with no decodable barcode can make the underlying WASM throw
// instead of resolving empty - both mean "no barcode found" to the user
// (CLAUDE.md Rule 18: no unhandled rejection, no silent dead end).
const detectFromPhoto = async (detector: BarcodeDetectorApi, photo: File): Promise<string | null> => {
  try {
    const results = await detector.detect(photo);
    return results.length > 0 ? results[0].rawValue : null;
  } catch {
    return null;
  }
};

// Null is "no code in this photo", a state the user has already been told
// about through onError - not a failure for the caller to word again.
export const readBarcodeFromPhoto = async (
  photo: File,
  onError: (message: string) => void,
): Promise<string | null> => {
  let detector: BarcodeDetectorApi;
  try {
    detector = await loadDetector();
  } catch {
    onError(SCANNER_LOAD_ERROR_MESSAGE);
    return null;
  }
  const code = await detectFromPhoto(detector, photo);
  if (code === null) {
    onError(NO_BARCODE_FOUND_MESSAGE);
  }
  return code;
};
