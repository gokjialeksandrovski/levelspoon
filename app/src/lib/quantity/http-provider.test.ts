import { afterEach, describe, expect, it, vi } from "vitest";

vi.stubEnv("OMNIROUTE_URL", "http://localhost:20128");
vi.stubEnv("OMNIROUTE_MODEL", "auto");

import { HttpQuantityProvider } from "./http-provider";

const stubFetchJson = (body: unknown, ok = true, status = 200) => {
  const fetchMock = vi.fn().mockResolvedValue({ ok, status, json: () => Promise.resolve(body) });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("HttpQuantityProvider.estimateGrams", () => {
  it("posts a chat-completions request and parses grams from the reply", async () => {
    const fetchMock = stubFetchJson({ choices: [{ message: { content: "184" } }] });

    const grams = await new HttpQuantityProvider().estimateGrams(Buffer.from("fake-photo-bytes"));

    expect(grams).toBe(184);
    const [url, requestInit] = fetchMock.mock.calls[0];
    expect(url).toBe("http://localhost:20128/v1/chat/completions");
    const body = JSON.parse(requestInit.body as string);
    expect(body.model).toBe("auto");
    const imagePart = body.messages[0].content.find(
      (part: { type: string }) => part.type === "image_url",
    );
    expect(imagePart.image_url.url).toBe(
      `data:image/jpeg;base64,${Buffer.from("fake-photo-bytes").toString("base64")}`,
    );
  });

  it("throws QuantityEstimationError when the reply is non-numeric", async () => {
    stubFetchJson({ choices: [{ message: { content: "not a number" } }] });

    await expect(
      new HttpQuantityProvider().estimateGrams(Buffer.from("photo")),
    ).rejects.toThrow("Quantity estimation failed");
  });

  it("wraps a non-ok gateway response with the status in its cause", async () => {
    stubFetchJson({}, false, 503);

    await expect(
      new HttpQuantityProvider().estimateGrams(Buffer.from("photo")),
    ).rejects.toMatchObject({
      message: "Quantity estimation failed",
      cause: expect.objectContaining({ message: expect.stringContaining("503") }),
    });
  });

  it("throws immediately when OMNIROUTE_URL is unset", async () => {
    vi.stubEnv("OMNIROUTE_URL", "");
    stubFetchJson({ choices: [{ message: { content: "150" } }] });

    await expect(
      new HttpQuantityProvider().estimateGrams(Buffer.from("photo")),
    ).rejects.toThrow("Missing required environment variable: OMNIROUTE_URL");
  });
});
