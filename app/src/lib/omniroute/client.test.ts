import { afterEach, describe, expect, it, vi } from "vitest";

vi.stubEnv("OMNIROUTE_URL", "http://localhost:20128");

import { omniRouteUrl, parseNumericResponse, postChatCompletion } from "./client";

const stubFetchJson = (body: unknown, ok = true, status = 200) => {
  const fetchMock = vi.fn().mockResolvedValue({ ok, status, json: () => Promise.resolve(body) });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("omniRouteUrl", () => {
  it("returns the configured URL", () => {
    expect(omniRouteUrl()).toBe("http://localhost:20128");
  });

  it("throws when OMNIROUTE_URL is unset", () => {
    vi.stubEnv("OMNIROUTE_URL", "");
    expect(() => omniRouteUrl()).toThrow("Missing required environment variable: OMNIROUTE_URL");
    vi.stubEnv("OMNIROUTE_URL", "http://localhost:20128");
  });
});

describe("postChatCompletion", () => {
  it("posts the given body to /v1/chat/completions and returns the parsed JSON", async () => {
    const fetchMock = stubFetchJson({ choices: [{ message: { content: "184" } }] });

    const body = await postChatCompletion("http://localhost:20128", { model: "auto" });

    expect(body).toEqual({ choices: [{ message: { content: "184" } }] });
    const [url, requestInit] = fetchMock.mock.calls[0];
    expect(url).toBe("http://localhost:20128/v1/chat/completions");
    expect(JSON.parse(requestInit.body as string)).toEqual({ model: "auto" });
  });

  it("throws when the response is not ok", async () => {
    stubFetchJson({}, false, 503);

    await expect(postChatCompletion("http://localhost:20128", {})).rejects.toThrow(
      "OmniRoute gateway request failed with status 503",
    );
  });
});

describe("parseNumericResponse", () => {
  it("parses the numeric content from the first choice", () => {
    expect(parseNumericResponse({ choices: [{ message: { content: "184" } }] })).toBe(184);
  });

  it("throws when the content is non-numeric", () => {
    expect(() => parseNumericResponse({ choices: [{ message: { content: "abc" } }] })).toThrow(
      "non-numeric response",
    );
  });

  it("throws when there are no choices", () => {
    expect(() => parseNumericResponse({})).toThrow("non-numeric response");
  });

  it("throws when the content is zero", () => {
    expect(() => parseNumericResponse({ choices: [{ message: { content: "0" } }] })).toThrow(
      "non-numeric response",
    );
  });

  it("throws when the content is negative", () => {
    expect(() => parseNumericResponse({ choices: [{ message: { content: "-1" } }] })).toThrow(
      "non-numeric response",
    );
  });
});
