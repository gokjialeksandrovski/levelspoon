import { describe, expect, it } from "vitest";

import { portionClassForName, portionClassForSlug } from "./portion-class";

describe("portionClassForSlug", () => {
  it("maps a curated bread slug to the bread class", () => {
    expect(portionClassForSlug("bread-white")).toBe("bread-slice");
    expect(portionClassForSlug("bread-whole-wheat")).toBe("bread-slice");
  });

  it("maps a curated egg slug to the egg class", () => {
    expect(portionClassForSlug("egg-whole-raw")).toBe("egg");
    expect(portionClassForSlug("egg-boiled")).toBe("egg");
  });

  it("maps each cup food to its own cup class", () => {
    expect(portionClassForSlug("rice-white-cooked")).toBe("cup-rice-white-cooked");
    expect(portionClassForSlug("oatmeal-cooked")).toBe("cup-oatmeal-cooked");
  });

  it("returns null for a slug with no portions and for no slug at all", () => {
    expect(portionClassForSlug("chicken-breast-raw")).toBeNull();
    expect(portionClassForSlug(null)).toBeNull();
  });
});

describe("portionClassForName", () => {
  it("matches a packaged bread by its romanized name", () => {
    expect(portionClassForName("zito bread toast 500g")).toBe("bread-slice");
  });

  it("matches a packaged cheese", () => {
    expect(portionClassForName("president cheese emmental")).toBe("cheese-slice");
  });

  it("does not match a compound word that merely contains the token", () => {
    expect(portionClassForName("gingerbread")).toBeNull();
    expect(portionClassForName("breadsticks classic")).toBeNull();
    // "Eggplant, raw" is a real fixture row; its one token is not "egg".
    expect(portionClassForName("eggplant raw")).toBeNull();
  });

  it("excludes a bread product that has no slices", () => {
    expect(portionClassForName("bread crumbs 200g")).toBeNull();
    expect(portionClassForName("bread flour type 500")).toBeNull();
    // A real row in fixtures/standard-foods.json, sold by the piece.
    expect(portionClassForName("pita bread")).toBeNull();
  });

  it("excludes cheese products that are not sliceable", () => {
    expect(portionClassForName("cream cheese natural")).toBeNull();
    expect(portionClassForName("cottage cheese 4%")).toBeNull();
    expect(portionClassForName("cheese spread garlic")).toBeNull();
  });

  it("excludes egg noodles, a real row in the standard-foods fixture", () => {
    expect(portionClassForName("noodles egg cooked")).toBeNull();
  });

  it("never name-matches a cup class", () => {
    expect(portionClassForName("rice cakes salted")).toBeNull();
    expect(portionClassForName("milk chocolate bar")).toBeNull();
    expect(portionClassForName("rice white cooked")).toBeNull();
  });

  it("returns null when a name matches two classes at once", () => {
    expect(portionClassForName("cheese and egg sandwich")).toBeNull();
  });
});
