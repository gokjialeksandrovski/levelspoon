import { imageMimeType, UnsupportedImageFormatError } from "./image-mime-type";

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

const UNAUTHORIZED_STATUS = 401;
const FORBIDDEN_STATUS = 403;
const KEY_REJECTED_STATUSES = new Set([UNAUTHORIZED_STATUS, FORBIDDEN_STATUS]);
const BAD_REQUEST_STATUS = 400;
const RATE_LIMITED_STATUS = 429;
// The OpenAI-compatible endpoint answers a bad key with 400 INVALID_ARGUMENT,
// "Please pass a valid API key", and no reason code: the text is the only signal.
const INVALID_KEY_MESSAGE = /api key/i;

const wait = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/** Why an AI call failed, in the terms a user can act on. Each becomes a
 * result-union member in the action that made the call. */
export type GeminiFailureKind = "photo_unreadable" | "key_missing" | "key_rejected" | "rate_limited" | "timed_out" | "unavailable";

export class MissingApiKeyError extends Error {
  constructor() {
    super("Missing required environment variable: GEMINI_API_KEY");
    this.name = "MissingApiKeyError";
  }
}

const requestFailureKind = (status: number, body: string): GeminiFailureKind => {
  if (KEY_REJECTED_STATUSES.has(status)) return "key_rejected";
  if (status === BAD_REQUEST_STATUS && INVALID_KEY_MESSAGE.test(body)) return "key_rejected";
  return status === RATE_LIMITED_STATUS ? "rate_limited" : "unavailable";
};

export class GeminiRequestError extends Error {
  readonly kind: GeminiFailureKind;

  constructor(status: number, body: string) {
    const kind = requestFailureKind(status, body);
    super(`Gemini API request failed with status ${status} (${kind})`);
    this.name = "GeminiRequestError";
    this.kind = kind;
  }
}

// Walks the cause chain: each provider wraps transport errors in its own class.
export const geminiFailureKind = (error: unknown): GeminiFailureKind => {
  if (error instanceof UnsupportedImageFormatError) return "photo_unreadable";
  if (error instanceof MissingApiKeyError) return "key_missing";
  if (error instanceof GeminiRequestError) return error.kind;
  if (error instanceof DOMException && error.name === "TimeoutError") return "timed_out";
  return error instanceof Error && error.cause !== undefined ? geminiFailureKind(error.cause) : "unavailable";
};

class TruncatedResponseError extends Error {
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
    throw new GeminiRequestError(response.status, await response.text());
  }
  return (await response.json()) as GeminiResponse;
};
