const DIGITS_ONLY = /^\d+$/;

const EAN_13_LENGTH = 13;
const UPC_A_LENGTH = 12;
const UPC_E_LENGTH = 8;

const CHECK_DIGIT_ODD_WEIGHT = 3;
const CHECK_DIGIT_EVEN_WEIGHT = 1;
const CHECK_DIGIT_MODULUS = 10;

const RESTRICTED_PREFIX_DELI = "02";
const RESTRICTED_PREFIX_INTERNAL = "04";
const RESTRICTED_PREFIX_RANGE_START = 20;
const RESTRICTED_PREFIX_RANGE_END = 29;

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
  if (rawCode.length === UPC_E_LENGTH) {
    return `0${expandUpcEToUpcA(rawCode)}`;
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
