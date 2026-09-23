import type { NutritionValues } from "@/types/nutrition";

import type { BarcodeLookupProvider, ExternalBarcodeMatch, ExternalLookupResult } from "./lookup-provider";

const OFF_API_BASE = "https://world.openfoodfacts.org/api/v3/product";
const OFF_NOT_FOUND_STATUS = 404;
const OFF_RATE_LIMITED_STATUS = 429;
const SOLID_BASIS_UNIT = "g";
const MISSING_NUTRIENT_VALUE = 0;
const APP_VERSION = "0.1.0";

export class OpenFoodFactsError extends Error {
  constructor(barcode: string, status: number) {
    super(`Open Food Facts lookup for ${barcode} failed with status ${status}`);
    this.name = "OpenFoodFactsError";
  }
}

interface OffNutriments {
  "energy-kcal_100g"?: number;
  fat_100g?: number;
  "saturated-fat_100g"?: number;
  carbohydrates_100g?: number;
  sugars_100g?: number;
  proteins_100g?: number;
  salt_100g?: number;
  fiber_100g?: number;
}

interface OffProduct {
  product_name?: string;
  quantity?: string;
  product_quantity_unit?: string;
  serving_quantity_unit?: string;
  nutriments?: OffNutriments;
}

interface OffResponse {
  product?: OffProduct;
}

// OFF's terms require a contact-identifying User-Agent on every request.
// Real (non-mock) deployment must set OFF_CONTACT_EMAIL - BARCODE_LOOKUP_PROVIDER
// defaults to mock, so this path isn't hit in local dev/CI.
const userAgent = (): string => {
  const contact = process.env.OFF_CONTACT_EMAIL ?? "unset-contact@per100.local";
  return `per100/${APP_VERSION} (${contact})`;
};

const toNutritionValues = (nutriments: OffNutriments = {}): NutritionValues => ({
  energyKcal: nutriments["energy-kcal_100g"] ?? MISSING_NUTRIENT_VALUE,
  fatG: nutriments.fat_100g ?? MISSING_NUTRIENT_VALUE,
  saturatesG: nutriments["saturated-fat_100g"] ?? MISSING_NUTRIENT_VALUE,
  carbohydrateG: nutriments.carbohydrates_100g ?? MISSING_NUTRIENT_VALUE,
  sugarsG: nutriments.sugars_100g ?? MISSING_NUTRIENT_VALUE,
  proteinG: nutriments.proteins_100g ?? MISSING_NUTRIENT_VALUE,
  saltG: nutriments.salt_100g ?? MISSING_NUTRIENT_VALUE,
  // Not MISSING_NUTRIENT_VALUE: an absent fibre figure is unknown, not zero.
  fibreG: nutriments.fiber_100g ?? null,
});

const toExternalMatch = (product: OffProduct): ExternalBarcodeMatch => ({
  nameGuess: product.product_name ?? "",
  nutritionPer100g: toNutritionValues(product.nutriments),
  // Measured against the live v3 API: nutrition_data_per is never "100ml"
  // (it reads "100g" or "serving", or is absent) - the quantity units are
  // the fields that actually carry "ml" for a beverage.
  nutritionBasisUnit: product.product_quantity_unit ?? product.serving_quantity_unit ?? SOLID_BASIS_UNIT,
  netWeightText: product.quantity ?? null,
});

export class OpenFoodFactsProvider implements BarcodeLookupProvider {
  async lookup(barcode: string): Promise<ExternalLookupResult> {
    const response = await fetch(`${OFF_API_BASE}/${barcode}.json`, {
      headers: { "User-Agent": userAgent() },
    });
    if (response.status === OFF_NOT_FOUND_STATUS || response.status === OFF_RATE_LIMITED_STATUS) {
      return { kind: "not_found" };
    }
    if (!response.ok) {
      throw new OpenFoodFactsError(barcode, response.status);
    }
    const body = (await response.json()) as OffResponse;
    if (!body.product) {
      return { kind: "not_found" };
    }
    return { kind: "found", match: toExternalMatch(body.product) };
  }
}
