/** A lazy-track guess is private by construction; a barcode or a portion
 * weight on it would imply a real, measured product. No screen offers either,
 * so this only ever fires on a bug - named so tests can tell it apart. */
export class AiEstimateNotEditableError extends Error {
  constructor(productId: string) {
    super(`Product ${productId} is an AI estimate and cannot take this edit`);
    this.name = "AiEstimateNotEditableError";
  }
}
