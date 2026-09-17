import { describe, expect, it } from "vitest";

import { contrastRatio, oklabDistance, relativeLuminance } from "./contrast";

describe("relativeLuminance", () => {
  it("returns 1 for white and 0 for black", () => {
    expect(relativeLuminance("#FFFFFF")).toBeCloseTo(1, 5);
    expect(relativeLuminance("#000000")).toBeCloseTo(0, 5);
  });
});

describe("contrastRatio", () => {
  it("returns 21:1 for black on white (WCAG's own reference figure)", () => {
    expect(contrastRatio("#000000", "#FFFFFF")).toBeCloseTo(21, 1);
  });

  it("is symmetric regardless of argument order", () => {
    expect(contrastRatio("#E05A47", "#FDFBF7")).toBeCloseTo(
      contrastRatio("#FDFBF7", "#E05A47"),
      10,
    );
  });

  // Regression fixtures: the exact accent values from spec §3.1 and their
  // resolved per-theme variants from spec §3.2. These are the real colors
  // this app ships - if a future token edit breaks one of these, this test
  // catches it before it reaches globals.css.
  it("confirms every accent's base hex against both theme backgrounds (spec §3.1 table)", () => {
    const CREAM = "#FDFBF7";
    const ESPRESSO = "#1A1816";
    expect(contrastRatio("#E05A47", CREAM)).toBeCloseTo(3.55, 1); // paprika
    expect(contrastRatio("#E5983B", CREAM)).toBeCloseTo(2.29, 1); // amber - fails even 3:1
    expect(contrastRatio("#6E9B66", CREAM)).toBeCloseTo(3.11, 1); // matcha
    expect(contrastRatio("#8B4A62", CREAM)).toBeCloseTo(6.24, 1); // plum
    expect(contrastRatio("#E05A47", ESPRESSO)).toBeCloseTo(4.82, 1);
    expect(contrastRatio("#E5983B", ESPRESSO)).toBeCloseTo(7.49, 1);
    expect(contrastRatio("#6E9B66", ESPRESSO)).toBeCloseTo(5.52, 1);
    expect(contrastRatio("#8B4A62", ESPRESSO)).toBeCloseTo(2.74, 1); // fails even 3:1
  });

  it("confirms every resolved per-theme text variant clears 4.5:1 (spec §3.2)", () => {
    const CREAM = "#FDFBF7";
    const ESPRESSO = "#1A1816";
    // Light-mode: paprika, amber, matcha darkened; plum unchanged.
    expect(contrastRatio("#CB4735", CREAM)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio("#AB6200", CREAM)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio("#537F4C", CREAM)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio("#8B4A62", CREAM)).toBeGreaterThanOrEqual(4.5);
    // Dark-mode: plum lightened; paprika/amber/matcha unchanged.
    expect(contrastRatio("#E05A47", ESPRESSO)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio("#E5983B", ESPRESSO)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio("#6E9B66", ESPRESSO)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio("#B16C84", ESPRESSO)).toBeGreaterThanOrEqual(4.5);
  });

  // prefers-contrast: more overrides in globals.css. Muted text must clear
  // AAA (7:1) and borders the 3:1 non-text floor on every surface they sit on.
  it("confirms the prefers-contrast: more tokens against every surface", () => {
    const darkSurfaces = ["#1A1816", "#201D1A", "#262320"];
    const lightSurfaces = ["#FDFBF7", "#FFFEFC", "#F5F2EA"];
    for (const surface of darkSurfaces) {
      expect(contrastRatio("#C9C2B6", surface)).toBeGreaterThanOrEqual(7);
      expect(contrastRatio("#776F64", surface)).toBeGreaterThanOrEqual(3);
    }
    for (const surface of lightSurfaces) {
      expect(contrastRatio("#45403A", surface)).toBeGreaterThanOrEqual(7);
      expect(contrastRatio("#8F8778", surface)).toBeGreaterThanOrEqual(3);
    }
  });
});

describe("oklabDistance", () => {
  it("returns 0 for identical colors", () => {
    expect(oklabDistance("#E05A47", "#E05A47")).toBe(0);
  });

  it("returns a larger distance for clearly different hues than for near-identical ones", () => {
    const redVsGreen = oklabDistance("#E05A47", "#6E9B66");
    const redVsAlmostRed = oklabDistance("#E05A47", "#E15B48");
    expect(redVsGreen).toBeGreaterThan(redVsAlmostRed);
  });

  // Mutual-distinguishability gate (spec §3.3). Threshold: OKLab's own
  // design target is that a Euclidean distance of ~0.02 is a just-noticeable
  // difference under good viewing conditions - 0.05 gives real margin above
  // bare JND, appropriate for a categorical color system where confusing
  // two categories has a real cost (spec §3.3, §3.4).
  it("keeps every light-mode accent pair above the distinguishability threshold", () => {
    const DISTINGUISHABILITY_THRESHOLD = 0.05;
    const lightAccents = ["#CB4735", "#AB6200", "#537F4C", "#8B4A62"];
    for (let i = 0; i < lightAccents.length; i++) {
      for (let j = i + 1; j < lightAccents.length; j++) {
        expect(oklabDistance(lightAccents[i], lightAccents[j])).toBeGreaterThanOrEqual(
          DISTINGUISHABILITY_THRESHOLD,
        );
      }
    }
  });

  it("keeps every dark-mode accent pair above the distinguishability threshold", () => {
    const DISTINGUISHABILITY_THRESHOLD = 0.05;
    const darkAccents = ["#E05A47", "#E5983B", "#6E9B66", "#B16C84"];
    for (let i = 0; i < darkAccents.length; i++) {
      for (let j = i + 1; j < darkAccents.length; j++) {
        expect(oklabDistance(darkAccents[i], darkAccents[j])).toBeGreaterThanOrEqual(
          DISTINGUISHABILITY_THRESHOLD,
        );
      }
    }
  });
});
