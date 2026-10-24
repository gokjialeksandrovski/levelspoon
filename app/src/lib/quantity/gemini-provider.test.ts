import { afterEach, describe, expect, it, vi } from "vitest";

vi.stubEnv("GEMINI_API_KEY", "test-key");
vi.stubEnv("GEMINI_MODEL", "gemini-3.5-flash-lite");

import { GeminiQuantityProvider } from "./gemini-provider";

// A valid 12-byte JPEG header so imageMimeType() resolves; the payload
// content is irrelevant to these tests.
const jpegPhoto = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0]);

const FOOD = "Rolled oats";

const stubFetchSequence = (responses: Array<{ ok: boolean; status: number; body: unknown }>) => {
  const fetchMock = vi.fn();
  for (const { ok, status, body } of responses) {
    fetchMock.mockResolvedValueOnce({ ok, status, json: () => Promise.resolve(body), text: () => Promise.resolve(JSON.stringify(body)) });
  }
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
};

const stubFetchJson = (body: unknown, ok = true, status = 200) =>
  stubFetchSequence([{ ok, status, body }]);

const reply = (content: string | null, finishReason = "stop") => ({ choices: [{ finish_reason: finishReason, message: { content } }] });

const gramsReply = (grams: unknown) => reply(JSON.stringify({ grams }));

const estimate = (photo = jpegPhoto) => new GeminiQuantityProvider().estimateGrams(photo, FOOD);

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("GeminiQuantityProvider.estimateGrams", () => {
  it("posts a bearer-authenticated request with the pinned model and parses grams", async () => {
    const fetchMock = stubFetchJson(gramsReply(184));

    expect(await estimate()).toEqual({ kind: "estimated", grams: 184 });
    const [url, requestInit] = fetchMock.mock.calls[0];
    expect(url).toBe("https://generativelanguage.googleapis.com/v1beta/openai/chat/completions");
    expect(requestInit.headers.Authorization).toBe("Bearer test-key");
    const body = JSON.parse(requestInit.body as string);
    expect(body.model).toBe("gemini-3.5-flash-lite");
    expect(body.response_format.type).toBe("json_schema");
    const imagePart = body.messages[0].content.find(
      (part: { type: string }) => part.type === "image_url",
    );
    expect(imagePart.image_url.url).toBe(
      `data:image/jpeg;base64,${jpegPhoto.toString("base64")}`,
    );
  });

  // On a plate of several foods, the name is what says which one to weigh.
  it("names the food being logged in the prompt", async () => {
    const fetchMock = stubFetchJson(gramsReply(184));
    await estimate();
    expect(fetchMock.mock.calls[0][1].body as string).toContain(`Food: ${FOOD}`);
  });

  // The pinned default is load-bearing: if GEMINI_MODEL is absent from an
  // environment, falling back to a retired model is a 404 in production.
  it("falls back to the pinned default model when GEMINI_MODEL is unset", async () => {
    vi.stubEnv("GEMINI_MODEL", "");
    const fetchMock = stubFetchJson(gramsReply(184));

    await estimate();

    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(body.model).toBe("gemini-3.5-flash-lite");

    vi.stubEnv("GEMINI_MODEL", "gemini-3.5-flash-lite");
  });

  it("answers no_estimate when the model gives 0", async () => {
    stubFetchJson(gramsReply(0));
    expect(await estimate()).toEqual({ kind: "no_estimate" });
  });

  it("answers no_estimate past the gram ceiling rather than filling the field with it", async () => {
    stubFetchJson(gramsReply(25000));
    expect(await estimate()).toEqual({ kind: "no_estimate" });
  });

  // Regression: a reasoning model once consumed the whole token budget and
  // returned content: null with finish_reason: "length"; the old parser
  // coerced that to "" and reported a misleading "non-numeric response".
  it("reports truncation, not a bad reply, when the budget runs out", async () => {
    stubFetchJson(reply(null, "length"));

    await expect(estimate()).rejects.toMatchObject({
      message: "Quantity estimation failed",
      cause: expect.objectContaining({ name: "TruncatedResponseError" }),
    });
  });

  // Free text read with parseFloat once turned "1,250" into 1 g.
  it("refuses a reply that is not the JSON object asked for", async () => {
    stubFetchJson(reply("1,250"));
    await expect(estimate()).rejects.toThrow("Quantity estimation failed");
  });

  it("refuses a gram figure that is not a number", async () => {
    stubFetchJson(gramsReply("about 200"));
    await expect(estimate()).rejects.toMatchObject({
      cause: expect.objectContaining({ name: "InvalidGramsReplyError" }),
    });
  });

  it("wraps a non-ok response with the status in its cause", async () => {
    const fetchMock = stubFetchJson({}, false, 429);

    await expect(estimate()).rejects.toMatchObject({
      message: "Quantity estimation failed",
      cause: expect.objectContaining({ message: expect.stringContaining("429") }),
    });
    // 429 is rate-limiting, not the transient high-demand 503 - retrying it
    // would just hammer an already-throttled key, so it must not retry.
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  // Regression: flash-lite occasionally answers 503 "high demand" on an
  // otherwise-healthy request (confirmed via direct curl: 3/3 calls to
  // flash-lite failed 503 while flash succeeded immediately). A short retry
  // absorbs that instead of surfacing a transient blip as a failure.
  it("retries after a 503 and succeeds on the next attempt", async () => {
    const fetchMock = stubFetchSequence([
      { ok: false, status: 503, body: {} },
      { ok: true, status: 200, body: gramsReply(184) },
    ]);

    expect(await estimate()).toEqual({ kind: "estimated", grams: 184 });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("gives up and wraps the error after repeated 503s", async () => {
    const fetchMock = stubFetchSequence([
      { ok: false, status: 503, body: {} },
      { ok: false, status: 503, body: {} },
      { ok: false, status: 503, body: {} },
    ]);

    await expect(estimate()).rejects.toMatchObject({
      message: "Quantity estimation failed",
      cause: expect.objectContaining({ message: expect.stringContaining("503") }),
    });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("throws immediately and unwrapped when GEMINI_API_KEY is unset", async () => {
    vi.stubEnv("GEMINI_API_KEY", "");
    stubFetchJson(gramsReply(150));

    await expect(estimate()).rejects.toThrow("Missing required environment variable: GEMINI_API_KEY");

    vi.stubEnv("GEMINI_API_KEY", "test-key");
  });

  it("rejects a payload that is not a supported image", async () => {
    stubFetchJson(gramsReply(150));

    await expect(estimate(Buffer.from("plain text", "ascii"))).rejects.toThrow("Unsupported image format");
  });
});
