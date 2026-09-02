import type { ServingSizeProvider } from "./provider";

// A fixed, plausible tablespoon-scale estimate - real accuracy isn't the
// point of the mock, letting local dev and CI run with zero AI spend is
// (mirrors MockQuantityProvider's rationale).
const MOCK_GRAMS = 30;

export class MockServingSizeProvider implements ServingSizeProvider {
  async convertToGrams(_measureText: string, _productName: string): Promise<number> {
    return MOCK_GRAMS;
  }
}
