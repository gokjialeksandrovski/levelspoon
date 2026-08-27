export interface QuantityProvider {
  estimateGrams(photo: Buffer): Promise<number>;
}
