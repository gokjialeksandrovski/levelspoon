import type { NutritionValues } from "@/actions/products";

import type { NullableNutritionValues, OcrProvider } from "./provider";

class OcrServiceError extends Error {
  constructor(endpoint: string, status: number) {
    super(`OCR service request to ${endpoint} failed with status ${status}`);
    this.name = "OcrServiceError";
  }
}

export class ServingGramsUnavailableError extends Error {
  constructor(
    public readonly servingSizeText: string,
    public readonly perServingValues: NutritionValues,
  ) {
    super(`Serving size "${servingSizeText}" has no known gram weight`);
    this.name = "ServingGramsUnavailableError";
  }
}

const UNPROCESSABLE = 422;

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
  values: RawNutritionValues;
  flags: string[];
}

// The 422 body ocr-service sends when it read every field off a US label
// but found no gram weight for the serving size - all 7 fields are
// guaranteed present here (parse_nutrition raises before this point if any
// were unreadable), unlike RawNutritionValues's general nullable shape.
interface RawPerServingValues {
  energy_kcal: number;
  fat_g: number;
  saturates_g: number;
  carbohydrate_g: number;
  sugars_g: number;
  protein_g: number;
  salt_g: number;
}

interface ServingGramsDetail {
  needs_serving_grams: true;
  serving_size_text: string;
  per_serving_values: RawPerServingValues;
}

const isServingGramsDetail = (detail: unknown): detail is ServingGramsDetail =>
  typeof detail === "object" &&
  detail !== null &&
  (detail as { needs_serving_grams?: unknown }).needs_serving_grams === true;

const toNullableNutritionValues = (raw: RawNutritionValues): NullableNutritionValues => ({
  energyKcal: raw.energy_kcal,
  fatG: raw.fat_g,
  saturatesG: raw.saturates_g,
  carbohydrateG: raw.carbohydrate_g,
  sugarsG: raw.sugars_g,
  proteinG: raw.protein_g,
  saltG: raw.salt_g,
});

const toRawNutritionValues = (values: NutritionValues): RawNutritionValues => ({
  energy_kcal: values.energyKcal,
  fat_g: values.fatG,
  saturates_g: values.saturatesG,
  carbohydrate_g: values.carbohydrateG,
  sugars_g: values.sugarsG,
  protein_g: values.proteinG,
  salt_g: values.saltG,
});

const toPerServingValues = (raw: RawPerServingValues): NutritionValues => ({
  energyKcal: raw.energy_kcal,
  fatG: raw.fat_g,
  saturatesG: raw.saturates_g,
  carbohydrateG: raw.carbohydrate_g,
  sugarsG: raw.sugars_g,
  proteinG: raw.protein_g,
  saltG: raw.salt_g,
});

const servingGramsErrorFrom = async (response: Response): Promise<ServingGramsUnavailableError | null> => {
  if (response.status !== UNPROCESSABLE) {
    return null;
  }
  const body = (await response.json()) as { detail: unknown };
  if (!isServingGramsDetail(body.detail)) {
    return null;
  }
  return new ServingGramsUnavailableError(
    body.detail.serving_size_text,
    toPerServingValues(body.detail.per_serving_values),
  );
};

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
  async extractProductName(photo: Blob): Promise<{ text: string }> {
    return (await postImage("/ocr/product-name", photo)) as { text: string };
  }

  async extractNutritionTable(
    photo: Blob,
  ): Promise<{ values: NullableNutritionValues; flags: string[] }> {
    const endpoint = "/ocr/nutrition-table";
    const formData = new FormData();
    formData.append("image", photo);
    const response = await fetch(`${ocrServiceUrl()}${endpoint}`, { method: "POST", body: formData });

    if (response.ok) {
      const raw = (await response.json()) as RawNutritionTableResponse;
      return { values: toNullableNutritionValues(raw.values), flags: raw.flags };
    }

    const servingGramsError = await servingGramsErrorFrom(response);
    if (servingGramsError) {
      throw servingGramsError;
    }
    throw new OcrServiceError(endpoint, response.status);
  }

  async validate(values: NutritionValues, energyKj?: number): Promise<{ flags: string[] }> {
    const body = { values: toRawNutritionValues(values), energy_kj: energyKj ?? null };
    return (await postJson("/validate", body)) as { flags: string[] };
  }
}
