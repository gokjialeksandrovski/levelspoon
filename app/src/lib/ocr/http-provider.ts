import type { NullableNutritionValues, OcrProvider } from "./provider";

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
  values: RawNutritionValues;
  flags: string[];
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

export class HttpOcrProvider implements OcrProvider {
  async extractProductName(photo: Blob): Promise<{ text: string }> {
    return (await postImage("/ocr/product-name", photo)) as { text: string };
  }

  async extractNutritionTable(
    photo: Blob,
  ): Promise<{ values: NullableNutritionValues; flags: string[] }> {
    const raw = (await postImage("/ocr/nutrition-table", photo)) as RawNutritionTableResponse;
    return { values: toNullableNutritionValues(raw.values), flags: raw.flags };
  }
}
