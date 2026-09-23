import type { BarcodeLookupProvider, ExternalBarcodeMatch, ExternalLookupResult } from "./lookup-provider";

// A canned OFF-shaped hit for every barcode except the reserved sentinel -
// enough for local dev/CI to exercise the external_match path with zero
// network calls (spec §10, same convention as OCR_PROVIDER/QUANTITY_PROVIDER).
export const MOCK_NOT_FOUND_BARCODE = "0000000000000";

const MOCK_MATCH: ExternalBarcodeMatch = {
  nameGuess: "Mock Product",
  nutritionPer100g: {
    energyKcal: 250, fatG: 10, saturatesG: 3, carbohydrateG: 30,
    // null, not a figure: OFF routinely has no fiber_100g, so the canned hit
    // is the shape the real provider returns most often.
    sugarsG: 12, proteinG: 6, saltG: 0.5, fibreG: null,
  },
  nutritionBasisUnit: "g",
  netWeightText: "250 g",
};

export class MockBarcodeLookupProvider implements BarcodeLookupProvider {
  async lookup(barcode: string): Promise<ExternalLookupResult> {
    if (barcode === MOCK_NOT_FOUND_BARCODE) {
      return { kind: "not_found" };
    }
    return { kind: "found", match: MOCK_MATCH };
  }
}
