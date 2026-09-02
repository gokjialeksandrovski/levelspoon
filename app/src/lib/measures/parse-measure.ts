import { canonicalUnit, KNOWN_ALIASES } from "./units";

export interface Measure {
  /** How many of `unit`. Mixed numbers and fractions are already reduced to a decimal. */
  quantity: number;
  /** The canonical unit name when recognised, otherwise the raw token lowercased. */
  unit: string;
}

const escapeForRegex = (alias: string): string => alias.replace(/[.]/g, "\\$&");

const ALIAS_ALTERNATION = KNOWN_ALIASES.map(escapeForRegex).join("|");

// A mixed number ("1 1/2"), a bare fraction ("1/2") or a decimal, then either a
// known alias or any bare word. Known aliases are tried first so "8 fl oz"
// cannot degrade to the bare-word branch, and the alternation is longest-first
// so "fl oz" beats "oz".
const MEASURE = new RegExp(
  String.raw`(\d+\s+\d+/\d+|\d+/\d+|\d+(?:[.,]\d+)?)\s*(${ALIAS_ALTERNATION}|[a-z]+)\b`,
  "i",
);

const toQuantity = (raw: string): number | null => {
  const mixed = /^(\d+)\s+(\d+)\/(\d+)$/.exec(raw);
  if (mixed) {
    return Number(mixed[1]) + Number(mixed[2]) / Number(mixed[3]);
  }
  const fraction = /^(\d+)\/(\d+)$/.exec(raw);
  if (fraction) {
    return Number(fraction[1]) / Number(fraction[2]);
  }
  const decimal = Number(raw.replace(",", "."));
  return Number.isFinite(decimal) ? decimal : null;
};

/**
 * The leftmost quantity-and-unit pair in a line of label or user text.
 *
 * Leftmost matters: "2 Tbsp (37g)" must read as two tablespoons, because the
 * printed gram weight is carried separately and the household measure is what
 * states the product's density.
 */
export const parseMeasure = (text: string): Measure | null => {
  const match = MEASURE.exec(text);
  if (!match) {
    return null;
  }
  const quantity = toQuantity(match[1]);
  if (quantity === null) {
    return null;
  }
  const token = match[2].toLowerCase();
  return { quantity, unit: canonicalUnit(token) ?? token };
};
