import type { GramsEstimate, QuantityProvider } from "./provider";

// A fixed, plausible single-serving estimate. Real accuracy isn't the
// point of the mock - letting local dev and CI run with zero AI spend is
// (spec §10).
const MOCK_ESTIMATE_GRAMS = 150;

export class MockQuantityProvider implements QuantityProvider {
  async estimateGrams(_photo: Buffer, _foodName: string): Promise<GramsEstimate> {
    return { kind: "estimated", grams: MOCK_ESTIMATE_GRAMS };
  }
}
