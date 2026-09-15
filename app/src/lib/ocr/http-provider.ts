import type { NutritionValues } from "@/types/nutrition";

import type { NullableNutritionValues, NutritionTableRead, OcrProvider } from "./provider";

class OcrServiceError extends Error {
  constructor(endpoint: string, status: number) {
    super(`OCR service request to ${endpoint} failed with status ${status}`);
    this.name = "OcrServiceError";
  }
}

// ocr-service's actual wire shape (per-field, per-100g) - snake_case, matching
// its validate.py flag naming that confirm-step.tsx's FLAG_TO_FIELD already
// documents. This never matched NullableNutritionValues's camelCase shape at
// runtime; only tier-5 (real ocr-service, no mock) can catch that, since
// MockOcrProvider hardcodes the camelCase shape directly.
interface RawNutritionValues {
  energy_kcal: number | null;
  fat_g: number | null;
  saturates_g: number | null;
  carbohydrate_g: number | null;
  sugars_g: number | null;
  protein_g: number | null;
  salt_g: number | null;
}

interface RawNutritionTableResponse {
  format: "eu" | "us";
  per_100g: RawNutritionValues | null;
  per_serving: RawNutritionValues | null;
  serving_size_text: string | null;
  serving_grams: number | null;
  servings_per_container: number | null;
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
});

const toNutritionTableRead = (raw: RawNutritionTableResponse): NutritionTableRead => {
  if (raw.format === "eu") {
    if (raw.per_100g === null) {
      throw new Error("ocr-service returned an EU reading with no per_100g block");
    }
    return { format: "eu", per100g: toNullableNutritionValues(raw.per_100g), flags: raw.flags };
  }
  if (raw.per_serving === null || raw.serving_size_text === null) {
    throw new Error("ocr-service returned a US reading with no per_serving block");
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
});

const ocrServiceUrl = (): string => {
  const url = process.env.OCR_SERVICE_URL;
  if (!url) {
    throw new Error("Missing required environment variable: OCR_SERVICE_URL");
  }
  return url;
};

const postImage = async (endpoint: string, photo: Blob): Promise<unknown> => {
  const formData = new FormData();
  formData.append("image", photo);

  const response = await fetch(`${ocrServiceUrl()}${endpoint}`, { method: "POST", body: formData });
  if (!response.ok) {
    throw new OcrServiceError(endpoint, response.status);
  }
  return response.json();
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
  async extractProductName(photo: Blob): Promise<{ text: string; netWeightText: string | null }> {
    const raw = (await postImage("/ocr/product-name", photo)) as RawProductNameResponse;
    return { text: raw.text, netWeightText: raw.net_weight_text };
  }

  async extractNutritionTable(photo: Blob): Promise<NutritionTableRead> {
    const raw = (await postImage("/ocr/nutrition-table", photo)) as RawNutritionTableResponse;
    return toNutritionTableRead(raw);
  }

  async validate(values: NutritionValues, energyKj?: number): Promise<{ flags: string[] }> {
    const body = { values: toRawNutritionValues(values), energy_kj: energyKj ?? null };
    return (await postJson("/validate", body)) as { flags: string[] };
  }
}
