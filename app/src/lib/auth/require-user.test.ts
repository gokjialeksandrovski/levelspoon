import { describe, expect, it, vi } from "vitest";

const mockAuth = vi.fn();
vi.mock("@/auth", () => ({ auth: () => mockAuth() }));

import { NotAuthenticatedError, requireUserId } from "./require-user";

describe("requireUserId", () => {
  it("returns the session's user id when authenticated", async () => {
    mockAuth.mockResolvedValue({ user: { id: "user-123" } });
    await expect(requireUserId()).resolves.toBe("user-123");
  });

  it("throws NotAuthenticatedError when there is no session", async () => {
    mockAuth.mockResolvedValue(null);
    await expect(requireUserId()).rejects.toThrow(NotAuthenticatedError);
  });
});
