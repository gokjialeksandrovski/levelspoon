import { imageMimeType } from "./image-mime-type";
import type { QuantityProvider } from "./provider";

const GEMINI_CHAT_COMPLETIONS_URL =
  "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions";

// An explicit version, never a *-latest alias: aliases silently change which
// model runs, and gemini-flash-lite-latest answered this same request in
// 16.0s against 1.36s for the pinned version (measured 2026-09-03).
const DEFAULT_MODEL = "gemini-3.5-flash-lite";

// Flash-Lite answers this prompt in 2-4 output tokens with 0 reasoning
// tokens (measured over 10 live calls, 2026-09-03). 64 leaves ~16x headroom
// while still bounding a model that unexpectedly reasons - which surfaces as
// TruncatedResponseError rather than being parsed as an empty reply.
const MAX_RESPONSE_TOKENS = 64;

// Bounds how long a server action waits before failing cleanly, instead of
// hanging indefinitely on a wedged request. One AbortSignal is shared across
// every retry attempt below, so this is the total budget, not a per-attempt one.
const REQUEST_TIMEOUT_MS = 30_000;

// Gemini's flash-lite tier occasionally answers 503 "high demand" on an
// otherwise-healthy request (confirmed 2026-09-04 via direct curl: 3/3
// consecutive calls to gemini-3.5-flash-lite failed 503 while
// gemini-3.5-flash succeeded immediately) - a short retry absorbs that
// instead of surfacing a transient blip as a failure. Scoped to 503 only:
// 429 is rate-limiting and retrying it would just hammer an already-
// throttled key.
const RETRYABLE_STATUS = 503;
const MAX_FETCH_ATTEMPTS = 3;
const RETRY_BASE_DELAY_MS = 300;

const wait = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

const ESTIMATE_PROMPT =
  "Estimate the weight in grams of the food shown. Reply with only a number.";

class MissingApiKeyError extends Error {
  constructor() {
    super("Missing required environment variable: GEMINI_API_KEY");
    this.name = "MissingApiKeyError";
  }
}

class GeminiRequestError extends Error {
  constructor(status: number) {
    super(`Gemini API request failed with status ${status}`);
    this.name = "GeminiRequestError";
  }
}

class TruncatedResponseError extends Error {
  constructor(maxTokens: number) {
    super(`Gemini response hit the ${maxTokens}-token budget before returning any content`);
    this.name = "TruncatedResponseError";
  }
}

class QuantityEstimationError extends Error {
  constructor(cause: unknown) {
    super("Quantity estimation failed");
    this.name = "QuantityEstimationError";
    this.cause = cause;
  }
}

interface GeminiResponse {
  choices?: Array<{
    finish_reason?: string;
    message?: { content?: string | null };
  }>;
}

const geminiApiKey = (): string => {
  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    throw new MissingApiKeyError();
  }
  return key;
};

const buildRequestBody = (photo: Buffer, mimeType: string): unknown => ({
  // `||` not `??`: an env file containing a bare `GEMINI_MODEL=` yields an
  // empty string, which `??` would happily send as the model name.
  model: process.env.GEMINI_MODEL || DEFAULT_MODEL,
  max_tokens: MAX_RESPONSE_TOKENS,
  messages: [
    {
      role: "user",
      content: [
        { type: "text", text: ESTIMATE_PROMPT },
        {
          type: "image_url",
          image_url: { url: `data:${mimeType};base64,${photo.toString("base64")}` },
        },
      ],
    },
  ],
});

const parseGramsResponse = (body: GeminiResponse): number => {
  const choice = body.choices?.[0];
  if (choice?.finish_reason === "length") {
    throw new TruncatedResponseError(MAX_RESPONSE_TOKENS);
  }
  const content = choice?.message?.content ?? "";
  const grams = Number.parseFloat(content);
  if (!Number.isFinite(grams) || grams <= 0) {
    throw new Error(`Gemini returned a non-numeric response: ${content}`);
  }
  return grams;
};

const requestWithRetry = async (apiKey: string, photo: Buffer, mimeType: string): Promise<Response> => {
  const init: RequestInit = {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify(buildRequestBody(photo, mimeType)),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  };
  let response = await fetch(GEMINI_CHAT_COMPLETIONS_URL, init);
  for (let attempt = 1; attempt < MAX_FETCH_ATTEMPTS && response.status === RETRYABLE_STATUS; attempt++) {
    await wait(RETRY_BASE_DELAY_MS * attempt);
    response = await fetch(GEMINI_CHAT_COMPLETIONS_URL, init);
  }
  return response;
};

export class GeminiQuantityProvider implements QuantityProvider {
  async estimateGrams(photo: Buffer): Promise<number> {
    // Both guards run before the try block, so a misconfiguration or a bad
    // input propagates unwrapped instead of being flattened into a generic
    // QuantityEstimationError (same posture as the OCR provider's guard).
    const apiKey = geminiApiKey();
    const mimeType = imageMimeType(photo);
    try {
      const response = await requestWithRetry(apiKey, photo, mimeType);
      if (!response.ok) {
        throw new GeminiRequestError(response.status);
      }
      return parseGramsResponse((await response.json()) as GeminiResponse);
    } catch (error) {
      throw new QuantityEstimationError(error);
    }
  }
}
