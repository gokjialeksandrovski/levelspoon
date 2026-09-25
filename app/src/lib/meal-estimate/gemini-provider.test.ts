import { afterEach, describe, expect, it, vi } from "vitest";

vi.stubEnv("GEMINI_API_KEY", "test-key");
vi.stubEnv("GEMINI_MODEL", "gemini-3.5-flash-lite");

import { GeminiMealEstimateProvider } from "./gemini-provider";

const jpegPhoto = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0]);
const ESTIMATE = { mealName: "Bowl", items: [{ name: "Rice", grams: 200, per100g: { energyKcal: 130 } }] };

const stubFetchSequence = (responses: Array<{ ok: boolean; status: number; body: unknown }>) => {
  const fetchMock = vi.fn();
  for (const { ok, status, body } of responses) {
    fetchMock.mockResolvedValueOnce({ ok, status, json: () => Promise.resolve(body) });
  }
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
};

const reply = (content: string | null, finishReason = "stop") => ({ choices: [{ finish_reason: finishReason, message: { content } }] });

afterEach(() => vi.unstubAllGlobals());

describe("GeminiMealEstimateProvider.estimate", () => {
  it("sends description, schema and pinned model, and returns parsed JSON", async () => {
    const fetchMock = stubFetchSequence([{ ok: true, status: 200, body: reply(JSON.stringify(ESTIMATE)) }]);

    const result = await new GeminiMealEstimateProvider().estimate("rice bowl", null);

    expect(result).toEqual(ESTIMATE);
    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(body.model).toBe("gemini-3.5-flash-lite");
    expect(body.response_format.type).toBe("json_schema");
    expect(JSON.stringify(body.messages)).toContain("rice bowl");
    expect(JSON.stringify(body.messages)).not.toContain("image_url");
  });

  it("attaches the photo when given", async () => {
    const fetchMock = stubFetchSequence([{ ok: true, status: 200, body: reply(JSON.stringify(ESTIMATE)) }]);
    await new GeminiMealEstimateProvider().estimate("", jpegPhoto);
    expect(fetchMock.mock.calls[0][1].body as string).toContain("data:image/jpeg;base64,");
  });

  it("wraps malformed JSON", async () => {
    stubFetchSequence([{ ok: true, status: 200, body: reply("not json") }]);
    await expect(new GeminiMealEstimateProvider().estimate("rice", null)).rejects.toThrow("Meal estimation failed");
  });

  it("wraps a truncated reply", async () => {
    stubFetchSequence([{ ok: true, status: 200, body: reply(null, "length") }]);
    await expect(new GeminiMealEstimateProvider().estimate("rice", null)).rejects.toMatchObject({
      message: "Meal estimation failed",
      cause: expect.objectContaining({ name: "TruncatedResponseError" }),
    });
  });

  it("retries a 503 through the shared client", async () => {
    const fetchMock = stubFetchSequence([
      { ok: false, status: 503, body: {} },
      { ok: true, status: 200, body: reply(JSON.stringify(ESTIMATE)) },
    ]);
    await expect(new GeminiMealEstimateProvider().estimate("rice", null)).resolves.toEqual(ESTIMATE);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("lets an unsupported photo through unwrapped", async () => {
    stubFetchSequence([{ ok: true, status: 200, body: reply(JSON.stringify(ESTIMATE)) }]);
    await expect(new GeminiMealEstimateProvider().estimate("rice", Buffer.from("heic?", "ascii"))).rejects.toThrow("Unsupported image format");
  });
});
