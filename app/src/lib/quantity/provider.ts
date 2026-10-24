/** "no_estimate" is an answer, not a failure: the food is not in the photo,
 * or the model could not judge its amount. */
export type GramsEstimate = { kind: "estimated"; grams: number } | { kind: "no_estimate" };

export interface QuantityProvider {
  estimateGrams(photo: Buffer, foodName: string): Promise<GramsEstimate>;
}
