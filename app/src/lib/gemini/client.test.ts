import { describe, expect, it } from "vitest";

import { geminiFailureKind, GeminiRequestError, MissingApiKeyError } from "./client";
import { UnsupportedImageFormatError } from "./image-mime-type";

// Body the OpenAI-compatible endpoint actually returns for a bad key.
const INVALID_KEY_BODY = JSON.stringify([{ error: { code: 400, message: "Please pass a valid API key", status: "INVALID_ARGUMENT" } }]);

const wrapped = (cause: unknown) => new Error("Quantity estimation failed", { cause });

describe("geminiFailureKind", () => {
  it("reads a bad key from Gemini's 400 body", () =>
    expect(geminiFailureKind(new GeminiRequestError(400, INVALID_KEY_BODY))).toBe("key_rejected"));
  it("reads a bad key from another provider's 401", () =>
    expect(geminiFailureKind(new GeminiRequestError(401, ""))).toBe("key_rejected"));
  it("keeps any other 400 unavailable", () =>
    expect(geminiFailureKind(new GeminiRequestError(400, '{"error":{"message":"Invalid JSON payload"}}'))).toBe("unavailable"));
  it("reads 429 as rate limited", () => expect(geminiFailureKind(new GeminiRequestError(429, ""))).toBe("rate_limited"));
  it("reads an aborted timeout", () =>
    expect(geminiFailureKind(new DOMException("The operation timed out.", "TimeoutError"))).toBe("timed_out"));
  it("reads a missing key", () => expect(geminiFailureKind(new MissingApiKeyError())).toBe("key_missing"));
  it("reads an unreadable photo", () => expect(geminiFailureKind(new UnsupportedImageFormatError("00"))).toBe("photo_unreadable"));
  it("walks a provider's wrapping error to its cause", () =>
    expect(geminiFailureKind(wrapped(new GeminiRequestError(429, "")))).toBe("rate_limited"));
  it("falls back to unavailable", () => expect(geminiFailureKind(new TypeError("fetch failed"))).toBe("unavailable"));
});
