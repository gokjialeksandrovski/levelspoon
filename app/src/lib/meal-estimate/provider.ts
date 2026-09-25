/** Returns Gemini's JSON as-is: narrowing it to plausible items is
 * lazy-track.utils' parseMealEstimate, the one place that rule lives. */
export interface MealEstimateProvider {
  estimate(description: string, photo: Buffer | null): Promise<unknown>;
}
