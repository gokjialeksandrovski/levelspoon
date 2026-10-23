import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import NextAuth, { CredentialsSignin } from "next-auth";
import Credentials from "next-auth/providers/credentials";

import { db } from "@/lib/db";
import { clientIp, takeGuestSignIn } from "@/lib/db/demo-quota";
import { users } from "@/lib/db/schema";
import { verifyPassword } from "@/lib/password";

class InvalidCredentialsError extends Error {
  constructor() {
    super("Invalid email or password");
    this.name = "InvalidCredentialsError";
  }
}

// CredentialsSignin, unlike the error above, puts its code in the client's
// signIn() result, so the demo page can say why it didn't start.
class DemoFullError extends CredentialsSignin {
  code = "demo_full";
}

// Reserved TLD: a guest row needs a unique email, and this one can never
// receive mail or collide with a real address.
const GUEST_EMAIL_DOMAIN = "guest.invalid";

// A guest is created on demo start and lives in the same JWT session cookie
// as an account: every action reads it by id, unchanged.
const startGuest = async (request: Request) => {
  if (!(await takeGuestSignIn(clientIp(request.headers)))) {
    throw new DemoFullError();
  }
  const [guest] = await db
    .insert(users)
    .values({ email: `${randomUUID()}@${GUEST_EMAIL_DOMAIN}`, isGuest: true })
    .returning({ id: users.id, email: users.email, name: users.name, isGuest: users.isGuest });
  return guest;
};

export const { handlers, auth, signIn, signOut } = NextAuth({
  // Required whenever a Credentials provider is present - Auth.js throws
  // UnsupportedStrategy otherwise (spec §15).
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
    Credentials({
      id: "guest",
      credentials: {},
      authorize: (_credentials, request) => startGuest(request),
    }),
  ],
  callbacks: {
    jwt: ({ token, user }) => {
      if (user?.id) {
        token.id = user.id;
        token.isGuest = user.isGuest === true;
      }
      return token;
    },
    session: ({ session, token }) => {
      session.user.id = token.id;
      session.user.isGuest = token.isGuest === true;
      return session;
    },
  },
});
