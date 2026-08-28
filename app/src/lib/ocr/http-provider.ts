import type { NullableNutritionValues, OcrProvider } from "./provider";

class OcrServiceError extends Error {
  constructor(endpoint: string, status: number) {
    super(`OCR service request to ${endpoint} failed with status ${status}`);
    this.name = "OcrServiceError";
  }
}

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
    return (await postImage("/ocr/nutrition-table", photo)) as {
      values: NullableNutritionValues;
      flags: string[];
    };
  }
}
