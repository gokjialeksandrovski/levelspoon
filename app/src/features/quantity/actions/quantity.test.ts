const mockAuth = vi.fn();
vi.mock("@/auth", () => ({ auth: () => mockAuth() }));

import { describe, expect, it, vi } from "vitest";

import { GuestNotAllowedError } from "@/lib/auth/require-user";

vi.stubEnv("QUANTITY_PROVIDER", "mock");

import { estimateQuantity } from "./quantity";

const photo = () => new Blob([Buffer.from("fake-photo-bytes")]);

describe("estimateQuantity", () => {
  it("returns a positive gram estimate from the mock provider", async () => {
    mockAuth.mockResolvedValue({ user: { id: crypto.randomUUID() } });
    const result = await estimateQuantity(photo());
    expect(result.grams).toBeGreaterThan(0);
  });

  it("refuses a demo user", async () => {
    mockAuth.mockResolvedValue({ user: { id: crypto.randomUUID(), isGuest: true } });
    await expect(estimateQuantity(photo())).rejects.toThrow(GuestNotAllowedError);
  });
});
