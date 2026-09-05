// sRGB <-> linear-light conversion constants (IEC 61966-2-1 / WCAG's own
// formula). SRGB_GAMMA_THRESHOLD is the breakpoint where the piecewise
// gamma curve switches from linear to power-law.
const SRGB_GAMMA_THRESHOLD = 0.04045;
const SRGB_LINEAR_DIVISOR = 12.92;
const SRGB_GAMMA_OFFSET = 0.055;
const SRGB_GAMMA_EXPONENT = 2.4;

// WCAG relative-luminance channel weights (ITU-R BT.709).
const LUMINANCE_WEIGHT_R = 0.2126;
const LUMINANCE_WEIGHT_G = 0.7152;
const LUMINANCE_WEIGHT_B = 0.0722;

// WCAG contrast formula's added constant, preventing division by zero on
// pure black and matching the spec's own (L1 + 0.05) / (L2 + 0.05) form.
const CONTRAST_OFFSET = 0.05;

// Hex color parsing constants
const HEX_RADIX = 16;
const HEX_CHANNEL_MAX = 255;

const hexToRgb = (hex: string): [number, number, number] => {
  const clean = hex.replace("#", "");
  return [
    Number.parseInt(clean.slice(0, 2), HEX_RADIX),
    Number.parseInt(clean.slice(2, 4), HEX_RADIX),
    Number.parseInt(clean.slice(4, 6), HEX_RADIX),
  ];
};

const srgbChannelToLinear = (channel255: number): number => {
  const c = channel255 / HEX_CHANNEL_MAX;
  return c <= SRGB_GAMMA_THRESHOLD
    ? c / SRGB_LINEAR_DIVISOR
    : ((c + SRGB_GAMMA_OFFSET) / (1 + SRGB_GAMMA_OFFSET)) ** SRGB_GAMMA_EXPONENT;
};

export const relativeLuminance = (hex: string): number => {
  const [r, g, b] = hexToRgb(hex).map(srgbChannelToLinear);
  return LUMINANCE_WEIGHT_R * r + LUMINANCE_WEIGHT_G * g + LUMINANCE_WEIGHT_B * b;
};

export const contrastRatio = (hexA: string, hexB: string): number => {
  const [lighter, darker] = [relativeLuminance(hexA), relativeLuminance(hexB)].sort(
    (a, b) => b - a,
  );
  return (lighter + CONTRAST_OFFSET) / (darker + CONTRAST_OFFSET);
};

// sRGB (linear) -> OKLab matrices, published by Bjorn Ottosson
// (https://bottosson.github.io/posts/oklab/). Named per the paper's own
// l'/m'/s' intermediate terms so the constants are traceable to their source.

// Linear RGB to LMS cone response matrix coefficients
const LINEAR_TO_LMS_L_R = 0.4122214708;
const LINEAR_TO_LMS_L_G = 0.5363325363;
const LINEAR_TO_LMS_L_B = 0.0514459929;
const LINEAR_TO_LMS_M_R = 0.2119034982;
const LINEAR_TO_LMS_M_G = 0.6806995451;
const LINEAR_TO_LMS_M_B = 0.1073969566;
const LINEAR_TO_LMS_S_R = 0.0883024619;
const LINEAR_TO_LMS_S_G = 0.2817188376;
const LINEAR_TO_LMS_S_B = 0.6299787005;

// LMS to OKLab coefficients
const OKLAB_L_L_ = 0.2104542553;
const OKLAB_L_M_ = 0.793617785;
const OKLAB_L_S_ = -0.0040720468;
const OKLAB_A_L_ = 1.9779984951;
const OKLAB_A_M_ = -2.428592205;
const OKLAB_A_S_ = 0.4505937099;
const OKLAB_B_L_ = 0.0259040371;
const OKLAB_B_M_ = 0.7827717662;
const OKLAB_B_S_ = -0.808675766;

const linearToLms = (r: number, g: number, b: number): [number, number, number] => [
  LINEAR_TO_LMS_L_R * r + LINEAR_TO_LMS_L_G * g + LINEAR_TO_LMS_L_B * b,
  LINEAR_TO_LMS_M_R * r + LINEAR_TO_LMS_M_G * g + LINEAR_TO_LMS_M_B * b,
  LINEAR_TO_LMS_S_R * r + LINEAR_TO_LMS_S_G * g + LINEAR_TO_LMS_S_B * b,
];

const lmsToOklab = (l: number, m: number, s: number): { l: number; a: number; b: number } => {
  const l_ = Math.cbrt(l);
  const m_ = Math.cbrt(m);
  const s_ = Math.cbrt(s);
  return {
    l: OKLAB_L_L_ * l_ + OKLAB_L_M_ * m_ + OKLAB_L_S_ * s_,
    a: OKLAB_A_L_ * l_ + OKLAB_A_M_ * m_ + OKLAB_A_S_ * s_,
    b: OKLAB_B_L_ * l_ + OKLAB_B_M_ * m_ + OKLAB_B_S_ * s_,
  };
};

export const hexToOklab = (hex: string): { l: number; a: number; b: number } => {
  const [r, g, b] = hexToRgb(hex).map(srgbChannelToLinear);
  const [lms_l, lms_m, lms_s] = linearToLms(r, g, b);
  return lmsToOklab(lms_l, lms_m, lms_s);
};

export const oklabDistance = (hexA: string, hexB: string): number => {
  const a = hexToOklab(hexA);
  const b = hexToOklab(hexB);
  return Math.sqrt((a.l - b.l) ** 2 + (a.a - b.a) ** 2 + (a.b - b.b) ** 2);
};
