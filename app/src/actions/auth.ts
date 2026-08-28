"use server";

import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { hashPassword } from "@/lib/password";

import { EmailAlreadyInUseError } from "./auth.errors";

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


export interface RegisterUserInput {
  email: string;
  password: string;
  name: string;
}

export const registerUser = async (
  input: RegisterUserInput,
): Promise<{ userId: string }> => {
  const passwordHash = await hashPassword(input.password);

  try {
    const [row] = await db
      .insert(users)
      .values({ email: input.email, name: input.name, passwordHash })
      .returning({ id: users.id });
    return { userId: row.id };
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new EmailAlreadyInUseError();
    }
    throw error;
  }
};
