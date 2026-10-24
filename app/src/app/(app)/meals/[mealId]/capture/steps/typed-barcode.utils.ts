import { normalizeBarcode, type NormalizeBarcodeResult } from "@/lib/barcode/normalize";

export type TypedBarcodeResult = { kind: "ok"; barcode: string } | { kind: "refused"; message: string };

export const BARCODE_NUMBER_HINT = "The digits printed under the bars, usually 13 of them.";

// Appended to a failed photo read wherever a Type control sits beside the
// camera: whatever stopped the decode, the printed digits still work.
export const TYPE_INSTEAD_HINT = "Or tap Type and enter the digits under the bars.";

const EMPTY_BARCODE_ERROR = "Type the barcode number first.";

// Every refusal the digits alone can explain is worded here, before any
// request. The server actions re-run this same pure check, so the two agree.
const TYPED_BARCODE_ERRORS: Record<Exclude<NormalizeBarcodeResult["kind"], "ok">, string> = {
  invalid_format: "A barcode has 8, 12 or 13 digits. Check the number on the package.",
  invalid_check_digit: "Those digits aren't a valid barcode. Check each one against the package.",
  restricted_circulation:
    "That's a shop's own code, like a deli or weighed-goods sticker. Use the barcode printed on the package itself.",
};

// Packages print the digits in groups ("5 901234 123457"), and people type the gaps.
const BARCODE_DIGIT_GAPS = /[\s-]/g;

export const parseTypedBarcode = (typed: string): TypedBarcodeResult => {
  const digits = typed.replace(BARCODE_DIGIT_GAPS, "");
  if (digits === "") {
    return { kind: "refused", message: EMPTY_BARCODE_ERROR };
  }
  const normalized = normalizeBarcode(digits);
  return normalized.kind === "ok"
    ? { kind: "ok", barcode: normalized.barcode }
    : { kind: "refused", message: TYPED_BARCODE_ERRORS[normalized.kind] };
};
