const DIGITS_ONLY = /^\d+$/;

const EAN_13_LENGTH = 13;
const UPC_A_LENGTH = 12;
// Eight digits is both EAN-8 and UPC-E; resolveEightDigitCode picks the reading.
const EIGHT_DIGIT_LENGTH = 8;
const EAN_8_PAD = "00000";

const CHECK_DIGIT_ODD_WEIGHT = 3;
const CHECK_DIGIT_EVEN_WEIGHT = 1;
const CHECK_DIGIT_MODULUS = 10;

const RESTRICTED_PREFIX_DELI = "02";
const RESTRICTED_PREFIX_INTERNAL = "04";
const RESTRICTED_PREFIX_RANGE_START = 20;
const RESTRICTED_PREFIX_RANGE_END = 29;

export class InvalidBarcodeError extends Error {
  constructor(rawCode: string) {
    super(`Barcode "${rawCode}" failed normalization or validation`);
    this.name = "InvalidBarcodeError";
  }
}

export type NormalizeBarcodeResult =
  | { kind: "ok"; barcode: string }
  | { kind: "invalid_format" }
  | { kind: "invalid_check_digit" }
  | { kind: "restricted_circulation" };

// GS1's weighted check-digit algorithm is length-agnostic when applied
// right-to-left, so one function covers UPC-A, EAN-13, and the UPC-A form
// UPC-E expands into.
const computeCheckDigit = (payload: string): number => {
  const digits = payload.split("").map(Number).reverse();
  const sum = digits.reduce((total, digit, index) => {
    const weight = index % 2 === 0 ? CHECK_DIGIT_ODD_WEIGHT : CHECK_DIGIT_EVEN_WEIGHT;
    return total + digit * weight;
  }, 0);
  return (CHECK_DIGIT_MODULUS - (sum % CHECK_DIGIT_MODULUS)) % CHECK_DIGIT_MODULUS;
};

const hasValidCheckDigit = (fullCode: string): boolean =>
  computeCheckDigit(fullCode.slice(0, -1)) === Number(fullCode.at(-1));

// GS1/zxing's UPC-E -> UPC-A expansion table: which digit positions the
// compressed code's trailing zero-run collapsed into depends on its last digit.
const expandUpcEToUpcA = (upce: string): string => {
  const [numberSystem, d1, d2, d3, d4, d5, lastDigit, checkDigit] = upce.split("");
  switch (lastDigit) {
    case "0":
    case "1":
    case "2":
      return `${numberSystem}${d1}${d2}${lastDigit}0000${d3}${d4}${d5}${checkDigit}`;
    case "3":
      return `${numberSystem}${d1}${d2}${d3}00000${d4}${d5}${checkDigit}`;
    case "4":
      return `${numberSystem}${d1}${d2}${d3}${d4}00000${d5}${checkDigit}`;
    default:
      return `${numberSystem}${d1}${d2}${d3}${d4}${d5}0000${lastDigit}${checkDigit}`;
  }
};

// EU-first: a real EAN-8 run through the UPC-E table expands into a different,
// wrong EAN-13 whose check digit still validates, so the EAN-8 reading is tried
// first. A code valid under both readings is inherently ambiguous - a raw digit
// string carries no symbology hint - and EAN-8 wins by that same bias.
const resolveEightDigitCode = (rawCode: string): string => {
  const ean8Candidate = `${EAN_8_PAD}${rawCode}`;
  return hasValidCheckDigit(ean8Candidate) ? ean8Candidate : `0${expandUpcEToUpcA(rawCode)}`;
};

const toCanonicalEan13 = (rawCode: string): string | null => {
  if (!DIGITS_ONLY.test(rawCode)) {
    return null;
  }
  if (rawCode.length === EAN_13_LENGTH) {
    return rawCode;
  }
  if (rawCode.length === UPC_A_LENGTH) {
    return `0${rawCode}`;
  }
  if (rawCode.length === EIGHT_DIGIT_LENGTH) {
    return resolveEightDigitCode(rawCode);
  }
  return null;
};

const isRestrictedCirculationPrefix = (canonical: string): boolean => {
  const prefix = canonical.slice(0, 2);
  if (prefix === RESTRICTED_PREFIX_DELI || prefix === RESTRICTED_PREFIX_INTERNAL) {
    return true;
  }
  const prefixNumber = Number(prefix);
  return prefixNumber >= RESTRICTED_PREFIX_RANGE_START && prefixNumber <= RESTRICTED_PREFIX_RANGE_END;
};

export const normalizeBarcode = (rawCode: string): NormalizeBarcodeResult => {
  const canonical = toCanonicalEan13(rawCode);
  if (canonical === null) {
    return { kind: "invalid_format" };
  }
  if (!hasValidCheckDigit(canonical)) {
    return { kind: "invalid_check_digit" };
  }
  if (isRestrictedCirculationPrefix(canonical)) {
    return { kind: "restricted_circulation" };
  }
  return { kind: "ok", barcode: canonical };
};

// For write paths: every Server Action is independently reachable, so a
// caller-supplied barcode is validated there too, not just on lookup.
export const toCanonicalBarcode = (rawCode: string): string => {
  const normalized = normalizeBarcode(rawCode);
  if (normalized.kind !== "ok") {
    throw new InvalidBarcodeError(rawCode);
  }
  return normalized.barcode;
};
