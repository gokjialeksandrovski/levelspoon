"use server";

import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { hashPassword } from "@/lib/password";

import { MIN_PASSWORD_LENGTH } from "./auth.utils";

const UNIQUE_VIOLATION = "23505";

const isUniqueViolation = (error: unknown): boolean => {
  if (typeof error !== "object" || error === null) {
    return false;
  }

  // Direct error code (unlikely with Drizzle, but handle it)
  if ("code" in error && (error as { code: unknown }).code === UNIQUE_VIOLATION) {
    return true;
  }

  // Drizzle wraps the error in a cause property
  const cause = (error as { cause?: unknown }).cause;
  return (
    typeof cause === "object" &&
    cause !== null &&
    "code" in cause &&
    (cause as { code: unknown }).code === UNIQUE_VIOLATION
  );
};


interface RegisterUserInput {
  email: string;
  password: string;
  name: string;
}

// The two ways sign-up fails that the form has to explain travel back as
// values, not thrown errors: a server action's thrown error reaches the
// browser as an opaque digest in production, so its message can't be shown.
export type RegisterUserResult =
  | { status: "created"; userId: string }
  | { status: "email_taken" }
  | { status: "password_too_short" };

export const registerUser = async (
  input: RegisterUserInput,
): Promise<RegisterUserResult> => {
  if (input.password.length < MIN_PASSWORD_LENGTH) {
    return { status: "password_too_short" };
  }
  const passwordHash = await hashPassword(input.password);

  try {
    const [row] = await db
      .insert(users)
      .values({ email: input.email, name: input.name, passwordHash })
      .returning({ id: users.id });
    return { status: "created", userId: row.id };
  } catch (error) {
    if (isUniqueViolation(error)) {
      return { status: "email_taken" };
    }
    throw error;
  }
};
