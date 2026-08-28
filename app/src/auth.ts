import { DrizzleAdapter } from "@auth/drizzle-adapter";
import { eq } from "drizzle-orm";
import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";

import { db } from "@/lib/db";
import { accounts, users } from "@/lib/db/schema";
import { verifyPassword } from "@/lib/password";

class InvalidCredentialsError extends Error {
  constructor() {
    super("Invalid email or password");
    this.name = "InvalidCredentialsError";
  }
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: DrizzleAdapter(db, { usersTable: users, accountsTable: accounts }),
  // Required whenever a Credentials provider is present - Auth.js throws
  // UnsupportedStrategy otherwise. This is app-wide, not per-provider: Google
  // logins get JWT sessions too, not database ones (spec §15).
  session: { strategy: "jwt" },
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      authorize: async (credentials) => {
        const email = credentials?.email;
        const password = credentials?.password;
        if (typeof email !== "string" || typeof password !== "string") {
          throw new InvalidCredentialsError();
        }

        const [user] = await db
          .select()
          .from(users)
          .where(eq(users.email, email))
          .limit(1);

        // Both branches below throw the identical InvalidCredentialsError -
        // deliberately. Splitting "no such user" from "wrong password" into
        // distinct messages would reintroduce account enumeration.
        if (!user?.passwordHash) {
          throw new InvalidCredentialsError();
        }

        const valid = await verifyPassword(password, user.passwordHash);
        if (!valid) {
          throw new InvalidCredentialsError();
        }

        return { id: user.id, email: user.email, name: user.name };
      },
    }),
    Google,
  ],
  callbacks: {
    jwt: ({ token, user }) => {
      if (user?.id) {
        token.id = user.id;
      }
      return token;
    },
    session: ({ session, token }) => {
      session.user.id = token.id;
      return session;
    },
  },
});
