import bcrypt from "bcryptjs";

const SALT_ROUNDS = 12;

export const hashPassword = async (plaintext: string): Promise<string> => {
  return bcrypt.hash(plaintext, SALT_ROUNDS);
};

export const verifyPassword = async (
  plaintext: string,
  hash: string,
): Promise<boolean> => {
  return bcrypt.compare(plaintext, hash);
};
