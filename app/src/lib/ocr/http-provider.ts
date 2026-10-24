import type { NutritionValues } from "@/types/nutrition";

import {
  isUnreadablePhoto,
  UNREADABLE_PHOTO,
  type NullableNutritionValues,
  type NutritionTableRead,
  type OcrProvider,
  type UnreadablePhoto,
} from "./provider";

// ocr-service's answer to an upload it cannot decode as an image.
const UNSUPPORTED_MEDIA_TYPE = 415;

class OcrServiceError extends Error {
  constructor(endpoint: string, status: number) {
    super(`OCR service request to ${endpoint} failed with status ${status}`);
    this.name = "OcrServiceError";
  }
}

// A 200 whose payload contradicts its own `format` field - distinct from
// OcrServiceError's transport failure, which a retry can fix and this cannot.
class OcrResponseShapeError extends Error {
  constructor(detail: string) {
    super(`ocr-service returned ${detail}`);
    this.name = "OcrResponseShapeError";
  }
}

// ocr-service's actual wire shape (per-field, per-100g) - snake_case, matching
// its validate.py flag naming that confirm-step.tsx's FLAG_TO_FIELD already
// documents - not NullableNutritionValues's camelCase shape. Only tier-5 (real
// ocr-service, no mock) catches a mismatch, since MockOcrProvider hardcodes the
// camelCase shape directly.
interface RawNutritionValues {
  energy_kcal: number | null;
  fat_g: number | null;
  saturates_g: number | null;
  carbohydrate_g: number | null;
  sugars_g: number | null;
  protein_g: number | null;
  salt_g: number | null;
  fibre_g: number | null;
}

interface RawNutritionTableResponse {
  format: "eu" | "us";
  per_100g: RawNutritionValues | null;
  per_serving: RawNutritionValues | null;
  serving_size_text: string | null;
  serving_grams: number | null;
  servings_per_container: number | null;
  basis_unit: string | null;
  flags: string[];
}

interface RawProductNameResponse {
  text: string;
  net_weight_text: string | null;
}

const toNullableNutritionValues = (raw: RawNutritionValues): NullableNutritionValues => ({
  energyKcal: raw.energy_kcal,
  fatG: raw.fat_g,
  saturatesG: raw.saturates_g,
  carbohydrateG: raw.carbohydrate_g,
  sugarsG: raw.sugars_g,
  proteinG: raw.protein_g,
  saltG: raw.salt_g,
  fibreG: raw.fibre_g,
});

// A US per-serving block is guaranteed complete: read_us_label raises rather
// than reporting a field it could not associate to a marker.
const toPerServingValues = (raw: RawNutritionValues): NutritionValues => ({
  energyKcal: Number(raw.energy_kcal),
  fatG: Number(raw.fat_g),
  saturatesG: Number(raw.saturates_g),
  carbohydrateG: Number(raw.carbohydrate_g),
  sugarsG: Number(raw.sugars_g),
  proteinG: Number(raw.protein_g),
  saltG: Number(raw.salt_g),
  // Not Number(): fibre is the one field read_us_label may report as null,
  // and Number(null) is 0.
  fibreG: raw.fibre_g,
});

const toNutritionTableRead = (raw: RawNutritionTableResponse): NutritionTableRead => {
  if (raw.format === "eu") {
    if (raw.per_100g === null || raw.basis_unit === null) {
      throw new OcrResponseShapeError("an EU reading with no per_100g block or basis_unit");
    }
    return { format: "eu", per100g: toNullableNutritionValues(raw.per_100g), basisUnit: raw.basis_unit, flags: raw.flags };
  }
  if (raw.per_serving === null || raw.serving_size_text === null) {
    throw new OcrResponseShapeError("a US reading with no per_serving block");
  }
  return {
    format: "us",
    perServing: toPerServingValues(raw.per_serving),
    servingSizeText: raw.serving_size_text,
    servingGrams: raw.serving_grams,
    servingsPerContainer: raw.servings_per_container,
  };
};

const toRawNutritionValues = (values: NutritionValues): RawNutritionValues => ({
  energy_kcal: values.energyKcal,
  fat_g: values.fatG,
  saturates_g: values.saturatesG,
  carbohydrate_g: values.carbohydrateG,
  sugars_g: values.sugarsG,
  protein_g: values.proteinG,
  salt_g: values.saltG,
  fibre_g: values.fibreG,
});

const ocrServiceUrl = (): string => {
  const url = process.env.OCR_SERVICE_URL;
  if (!url) {
    throw new Error("Missing required environment variable: OCR_SERVICE_URL");
  }
  return url;
};

const postImage = async <Raw extends object>(endpoint: string, photo: Blob): Promise<Raw | UnreadablePhoto> => {
  const formData = new FormData();
  formData.append("image", photo);

  const response = await fetch(`${ocrServiceUrl()}${endpoint}`, { method: "POST", body: formData });
  if (response.status === UNSUPPORTED_MEDIA_TYPE) {
    return UNREADABLE_PHOTO;
  }
  if (!response.ok) {
    throw new OcrServiceError(endpoint, response.status);
  }
  return (await response.json()) as Raw;
};

const postJson = async (endpoint: string, body: unknown): Promise<unknown> => {
  const response = await fetch(`${ocrServiceUrl()}${endpoint}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    throw new OcrServiceError(endpoint, response.status);
  }
  return response.json();
};

export class HttpOcrProvider implements OcrProvider {
  async extractProductName(photo: Blob): Promise<{ text: string; netWeightText: string | null } | UnreadablePhoto> {
    const raw = await postImage<RawProductNameResponse>("/ocr/product-name", photo);
    return isUnreadablePhoto(raw) ? raw : { text: raw.text, netWeightText: raw.net_weight_text };
  }

  async extractNutritionTable(photo: Blob): Promise<NutritionTableRead | UnreadablePhoto> {
    const raw = await postImage<RawNutritionTableResponse>("/ocr/nutrition-table", photo);
    return isUnreadablePhoto(raw) ? raw : toNutritionTableRead(raw);
  }

  async validate(values: NutritionValues, energyKj?: number): Promise<{ flags: string[] }> {
    const body = { values: toRawNutritionValues(values), energy_kj: energyKj ?? null };
    return (await postJson("/validate", body)) as { flags: string[] };
  }
}
