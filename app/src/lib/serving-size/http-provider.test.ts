import { afterEach, describe, expect, it, vi } from "vitest";

vi.stubEnv("OMNIROUTE_URL", "http://localhost:20128");
vi.stubEnv("OMNIROUTE_MODEL", "auto");

import { HttpServingSizeProvider } from "./http-provider";

const stubFetchJson = (body: unknown, ok = true, status = 200) => {
  const fetchMock = vi.fn().mockResolvedValue({ ok, status, json: () => Promise.resolve(body) });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("HttpServingSizeProvider.convertToGrams", () => {
  it("posts a text-only chat-completions request and parses grams from the reply", async () => {
    const fetchMock = stubFetchJson({ choices: [{ message: { content: "30" } }] });

    const grams = await new HttpServingSizeProvider().convertToGrams(
      "2 Tablespoon",
      "Reduced Fat Peanut Butter",
    );

    expect(grams).toBe(30);
    const [url, requestInit] = fetchMock.mock.calls[0];
    expect(url).toBe("http://localhost:20128/v1/chat/completions");
    const body = JSON.parse(requestInit.body as string);
    expect(body.model).toBe("auto");
    expect(body.max_tokens).toBe(512);
    expect(body.messages[0].content).toBe(
      'Convert this serving size to grams: "2 Tablespoon" of "Reduced Fat Peanut Butter". Reply with only a number.',
    );
  });

  it("throws ServingSizeEstimationError when the reply is non-numeric", async () => {
    stubFetchJson({ choices: [{ message: { content: "not a number" } }] });

    await expect(
      new HttpServingSizeProvider().convertToGrams("2 Tablespoon", "Peanut Butter"),
    ).rejects.toThrow("Serving size estimation failed");
  });

  it("wraps a non-ok gateway response with the status in its cause", async () => {
    stubFetchJson({}, false, 503);

    await expect(
      new HttpServingSizeProvider().convertToGrams("2 Tablespoon", "Peanut Butter"),
    ).rejects.toMatchObject({
      message: "Serving size estimation failed",
      cause: expect.objectContaining({ message: expect.stringContaining("503") }),
    });
  });

  it("throws immediately when OMNIROUTE_URL is unset", async () => {
    vi.stubEnv("OMNIROUTE_URL", "");
    stubFetchJson({ choices: [{ message: { content: "30" } }] });

    await expect(
      new HttpServingSizeProvider().convertToGrams("2 Tablespoon", "Peanut Butter"),
    ).rejects.toThrow("Missing required environment variable: OMNIROUTE_URL");
  });
});
