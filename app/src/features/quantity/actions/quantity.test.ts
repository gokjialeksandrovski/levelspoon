const mockAuth = vi.fn();
vi.mock("@/auth", () => ({ auth: () => mockAuth() }));

import { describe, expect, it, vi } from "vitest";

import { GuestNotAllowedError } from "@/lib/auth/require-user";

vi.stubEnv("QUANTITY_PROVIDER", "mock");

import { estimateQuantity } from "./quantity";

const photo = () => new Blob([Buffer.from("fake-photo-bytes")]);

const signedIn = () => mockAuth.mockResolvedValue({ user: { id: crypto.randomUUID() } });

describe("estimateQuantity", () => {
  it("returns a positive gram estimate from the mock provider", async () => {
    signedIn();
    const result = await estimateQuantity(photo(), "Rice");
    expect(result.kind === "estimated" && result.grams > 0).toBe(true);
  });

  it("refuses a demo user", async () => {
    mockAuth.mockResolvedValue({ user: { id: crypto.randomUUID(), isGuest: true } });
    await expect(estimateQuantity(photo(), "Rice")).rejects.toThrow(GuestNotAllowedError);
  });

  // Failures cross to the client as data: a thrown error arrives there bare.
  it("reports a missing key as a result, not a throw", async () => {
    signedIn();
    vi.stubEnv("QUANTITY_PROVIDER", "gemini");
    vi.stubEnv("GEMINI_API_KEY", "");
    expect(await estimateQuantity(photo(), "Rice")).toEqual({ kind: "key_missing" });
    vi.stubEnv("QUANTITY_PROVIDER", "mock");
  });

  it("reports an unreadable photo format", async () => {
    signedIn();
    vi.stubEnv("QUANTITY_PROVIDER", "gemini");
    vi.stubEnv("GEMINI_API_KEY", "test-key");
    expect(await estimateQuantity(photo(), "Rice")).toEqual({ kind: "photo_unreadable" });
    vi.stubEnv("QUANTITY_PROVIDER", "mock");
  });
});
