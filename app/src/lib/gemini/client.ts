import { imageMimeType } from "./image-mime-type";

const GEMINI_CHAT_COMPLETIONS_URL =
  "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions";

// An explicit version, never a *-latest alias: aliases silently change which
// model runs, and gemini-flash-lite-latest answered this same request in
// 16.0s against 1.36s for the pinned version (measured 2026-09-03).
const DEFAULT_MODEL = "gemini-3.5-flash-lite";

// Bounds how long a server action waits before failing cleanly, instead of
// hanging indefinitely on a wedged request. One AbortSignal is shared across
// every retry attempt below, so this is the total budget, not a per-attempt one.
const REQUEST_TIMEOUT_MS = 30_000;

// Gemini's flash-lite tier occasionally answers 503 "high demand" on an
// otherwise-healthy request (confirmed via direct curl: 3/3 consecutive
// calls to flash-lite failed 503 while flash succeeded immediately) - a
// short retry absorbs that. Scoped to 503 only: 429 is rate-limiting and
// retrying would hammer an already-throttled key.
const RETRYABLE_STATUS = 503;
const MAX_FETCH_ATTEMPTS = 3;
const RETRY_BASE_DELAY_MS = 300;

const wait = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

export class MissingApiKeyError extends Error {
  constructor() {
    super("Missing required environment variable: GEMINI_API_KEY");
    this.name = "MissingApiKeyError";
  }
}

export class GeminiRequestError extends Error {
  constructor(status: number) {
    super(`Gemini API request failed with status ${status}`);
    this.name = "GeminiRequestError";
  }
}

export class TruncatedResponseError extends Error {
  constructor(maxTokens: number) {
    super(`Gemini response hit the ${maxTokens}-token budget before returning any content`);
    this.name = "TruncatedResponseError";
  }
}

export interface GeminiChoice {
  finish_reason?: string;
  message?: { content?: string | null };
}

export interface GeminiResponse {
  choices?: GeminiChoice[];
}

// Shared by every provider's reply parser: a reply cut off by the token
// budget surfaces as TruncatedResponseError instead of being parsed as an
// empty or partial answer.
export const firstChoice = (body: GeminiResponse, maxTokens: number): GeminiChoice | undefined => {
  const choice = body.choices?.[0];
  if (choice?.finish_reason === "length") {
    throw new TruncatedResponseError(maxTokens);
  }
  return choice;
};

export const geminiApiKey = (): string => {
  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    throw new MissingApiKeyError();
  }
  return key;
};

// `||` not `??`: an env file containing a bare `GEMINI_MODEL=` yields an
// empty string, which `??` would happily send as the model name.
export const geminiModel = (): string => process.env.GEMINI_MODEL || DEFAULT_MODEL;

export const imagePart = (photo: Buffer) => ({
  type: "image_url" as const,
  image_url: { url: `data:${imageMimeType(photo)};base64,${photo.toString("base64")}` },
});

const requestWithRetry = async (apiKey: string, body: unknown): Promise<Response> => {
  const init: RequestInit = {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  };
  let response = await fetch(GEMINI_CHAT_COMPLETIONS_URL, init);
  for (let attempt = 1; attempt < MAX_FETCH_ATTEMPTS && response.status === RETRYABLE_STATUS; attempt++) {
    await wait(RETRY_BASE_DELAY_MS * attempt);
    response = await fetch(GEMINI_CHAT_COMPLETIONS_URL, init);
  }
  return response;
};

export const postChatCompletion = async (apiKey: string, body: unknown): Promise<GeminiResponse> => {
  const response = await requestWithRetry(apiKey, body);
  if (!response.ok) {
    throw new GeminiRequestError(response.status);
  }
  return (await response.json()) as GeminiResponse;
};
