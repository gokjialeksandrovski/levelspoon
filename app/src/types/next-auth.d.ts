import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: { id: string } & DefaultSession["user"];
  }
}

// Augmenting "@auth/core/jwt" (not the documented "next-auth/jwt") because in
// this next-auth beta, next-auth/jwt.d.ts only does `export * from
// "@auth/core/jwt"` with no local JWT declaration. TypeScript's declaration
// merging doesn't reliably attach to a re-exported interface unless some file
// separately imports it - which nothing in this codebase does - so callback
// code inside @auth/core (which imports JWT via a relative path) never saw
// the augmented field and `token.id` stayed typed as `unknown`. Augmenting
// the true declaration site fixes this deterministically. Verified against a
// clean tsconfig.tsbuildinfo (incremental caching otherwise papers over the
// failure and makes it look fixed when it isn't).
declare module "@auth/core/jwt" {
  interface JWT {
    id: string;
  }
}
