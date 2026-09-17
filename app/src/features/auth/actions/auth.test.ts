import { eq, sql } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";

import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";

import { registerUser } from "./auth";

beforeEach(async () => {
  await db.execute(sql`TRUNCATE TABLE "user" CASCADE`);
});

describe("registerUser", () => {
  it("creates a user with a hashed password", async () => {
    const result = await registerUser({
      email: "new-user@example.com",
      password: "correct horse battery staple",
      name: "New User",
    });

    if (result.status !== "created") {
      throw new Error(`expected created, got ${result.status}`);
    }
    const [row] = await db.select().from(users).where(eq(users.id, result.userId));
    expect(row.email).toBe("new-user@example.com");
    expect(row.passwordHash).not.toBe("correct horse battery staple");
  });

  // Returned, not thrown: a server action's thrown error reaches the browser
  // as an opaque digest in production, so an expected outcome the form has to
  // explain must travel as a value.
  it("reports a duplicate email as a result the form can explain", async () => {
    await registerUser({ email: "dup@example.com", password: "password-one", name: "First" });

    const result = await registerUser({ email: "dup@example.com", password: "password-two", name: "Second" });

    expect(result.status).toBe("email_taken");
  });

  it("rejects a password shorter than the stated minimum without creating a user", async () => {
    const result = await registerUser({ email: "short@example.com", password: "abc1234", name: "Short" });

    expect(result.status).toBe("password_too_short");
    expect(await db.select().from(users)).toEqual([]);
  });
});
