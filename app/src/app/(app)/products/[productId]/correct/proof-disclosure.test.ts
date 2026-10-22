import { describe, expect, it, vi } from "vitest";

// Server actions and the WASM-backed scanner are never called by the pure
// decisions under test; importing them for real pulls next-auth and a 1MB
// module into a node test env.
vi.mock("@/features/products/actions/barcode", () => ({ linkBarcode: vi.fn(), lookupBarcode: vi.fn() }));
vi.mock("@/features/products/actions/ocr", () => ({ ocrNutritionTable: vi.fn() }));
vi.mock("@/features/products/actions/products", () => ({ attachLabelProof: vi.fn() }));
vi.mock("@/lib/barcode/read-photo", () => ({ readBarcodeFromPhoto: vi.fn() }));

import type { NutritionRead } from "@/features/products/actions/ocr";
import type { ProductForCorrection } from "@/features/products/actions/products";
import type { FieldValues } from "@/lib/ocr/nutrition-fields";
import { NOTHING_LEARNED } from "@/lib/measures/learn";

import { decideBarcodeOutcome, proofOptions, reviewLabelRead } from "./proof-disclosure";

const TYPED: FieldValues = {
  energyKcal: "240", fatG: "9", saturatesG: "2", carbohydrateG: "30", sugarsG: "5", proteinG: "8", saltG: "0.5", fibreG: "",
};

const LABEL_VALUES = {
  energyKcal: 240, fatG: 12, saturatesG: 2, carbohydrateG: 30, sugarsG: 5, proteinG: 8, saltG: 0.5, fibreG: null,
};

const per100gRead = (values: typeof LABEL_VALUES, flags: string[] = []): NutritionRead => ({
  kind: "per100g",
  values,
  flags,
  learned: NOTHING_LEARNED,
  nutritionBasisUnit: "g",
  nutritionBasisQuantity: 100,
});

const PRODUCT = {
  id: "product-1",
  name: "fstak",
  nutritionBasisUnit: "g",
  nutritionBasisQuantity: 100,
} as ProductForCorrection;

describe("proofOptions", () => {
  it("offers both proofs to a product nobody else can see", () => {
    expect(proofOptions({ nutritionPhotoKey: null, hasBarcode: false })).toEqual({ label: true, barcode: true });
  });

  it("offers only a barcode once a label photo vouches for the figures", () => {
    expect(proofOptions({ nutritionPhotoKey: "products/a.jpg", hasBarcode: false })).toEqual({
      label: false,
      barcode: true,
    });
  });

  it("offers nothing to a product that already has a barcode", () => {
    expect(proofOptions({ nutritionPhotoKey: null, hasBarcode: true })).toEqual({ label: false, barcode: false });
    expect(proofOptions({ nutritionPhotoKey: "products/a.jpg", hasBarcode: true })).toEqual({
      label: false,
      barcode: false,
    });
  });
});

describe("reviewLabelRead", () => {
  it("attaches straight away when the label agrees with the typed figures", () => {
    const outcome = reviewLabelRead(per100gRead({ ...LABEL_VALUES, fatG: 9 }), TYPED);

    expect(outcome.kind).toBe("matches");
  });

  it("lists only the figures that disagree", () => {
    const outcome = reviewLabelRead(per100gRead(LABEL_VALUES), TYPED);

    expect(outcome).toMatchObject({
      kind: "differs",
      changes: [{ field: "fatG", from: "9", to: "12" }],
    });
  });

  it("will not offer figures the validator flagged, which the confirm step would refuse to save", () => {
    const outcome = reviewLabelRead(per100gRead(LABEL_VALUES, ["saturates_g"]), TYPED);

    expect(outcome).toMatchObject({ kind: "differs", flagged: true });
  });

  it("refuses a half-read table rather than saving its blanks as zeroes", () => {
    const outcome = reviewLabelRead(per100gRead({ ...LABEL_VALUES, saltG: null as unknown as number }), TYPED);

    expect(outcome).toEqual({
      kind: "error",
      message: "Couldn't read every figure off that label. Try a straighter, closer shot of the table.",
    });
  });

  it("names the product a borrowed photo already belongs to", () => {
    const outcome = reviewLabelRead({ kind: "photo-already-used", ownerName: "Oat biscuits" }, TYPED);

    expect(outcome).toMatchObject({ kind: "error", message: expect.stringContaining("Oat biscuits") });
  });
});

describe("decideBarcodeOutcome", () => {
  const externalMatch = (values: typeof LABEL_VALUES, basisUnit = "g") => ({
    kind: "external_match" as const,
    barcode: "4006381333931",
    nameGuess: "Mock Product",
    nutritionPer100g: values,
    nutritionBasisUnit: basisUnit,
    netWeightText: null,
    flags: [],
    duplicates: [],
  });

  it("refuses a code our own database already holds", () => {
    const outcome = decideBarcodeOutcome(
      { kind: "internal_match", product: { id: "other", name: "Other Product" } as never },
      PRODUCT,
      TYPED,
    );

    expect(outcome.error).toBe("This barcode already belongs to Other Product.");
    expect(outcome.link).toBeUndefined();
  });

  it("links a code neither source has ever seen", () => {
    const outcome = decideBarcodeOutcome({ kind: "not_found", barcode: "4006381333931" }, PRODUCT, TYPED);

    expect(outcome.link).toBe("4006381333931");
  });

  it("offers the listed figures for comparison when they disagree", () => {
    const outcome = decideBarcodeOutcome(externalMatch(LABEL_VALUES), PRODUCT, TYPED);

    expect(outcome.review).toMatchObject({
      name: "Mock Product",
      changes: [{ field: "fatG", from: "9", to: "12" }],
    });
  });

  it("links without a comparison when the listing agrees", () => {
    const outcome = decideBarcodeOutcome(externalMatch({ ...LABEL_VALUES, fatG: 9 }), PRODUCT, TYPED);

    expect(outcome.link).toBe("4006381333931");
    expect(outcome.review).toBeUndefined();
  });

  it("links without a comparison when the listing is measured another way", () => {
    const outcome = decideBarcodeOutcome(externalMatch(LABEL_VALUES, "ml"), PRODUCT, TYPED);

    expect(outcome.link).toBe("4006381333931");
    expect(outcome.review).toBeUndefined();
  });
});
