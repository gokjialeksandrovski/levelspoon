import { eq, sql } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";

import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";

import { registerUser } from "./auth";
import { EmailAlreadyInUseError } from "./auth.errors";

beforeEach(async () => {
  await db.execute(sql`TRUNCATE TABLE "user" CASCADE`);
});

describe("registerUser", () => {
  it("creates a user with a hashed password", async () => {
    const { userId } = await registerUser({
      email: "new-user@example.com",
      password: "correct horse battery staple",
      name: "New User",
    });

    const [row] = await db.select().from(users).where(eq(users.id, userId));
    expect(row.email).toBe("new-user@example.com");
    expect(row.passwordHash).not.toBe("correct horse battery staple");
  });

  it("throws EmailAlreadyInUseError on a duplicate email", async () => {
    await registerUser({ email: "dup@example.com", password: "password-one", name: "First" });

    await expect(
      registerUser({ email: "dup@example.com", password: "password-two", name: "Second" }),
    ).rejects.toThrow(EmailAlreadyInUseError);
  });
});
