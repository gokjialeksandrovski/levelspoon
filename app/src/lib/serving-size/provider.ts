export interface ServingSizeProvider {
  convertToGrams(measureText: string, productName: string): Promise<number>;
}
