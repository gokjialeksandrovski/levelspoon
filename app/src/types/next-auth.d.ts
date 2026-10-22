import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: { id: string; isGuest?: boolean } & DefaultSession["user"];
  }

  interface User {
    isGuest?: boolean;
  }
}

// Augments "@auth/core/jwt" (not the documented "next-auth/jwt"): this
// beta's next-auth/jwt.d.ts only re-exports from "@auth/core/jwt" with no
// local declaration, and TS's declaration merging doesn't reliably attach
// to a re-exported interface unless something imports it directly - nothing
// here does. Augmenting the true declaration site fixes `token.id` typing
// deterministically. Verify against a clean tsconfig.tsbuildinfo -
// incremental caching can paper over the failure.
declare module "@auth/core/jwt" {
  interface JWT {
    id: string;
    isGuest?: boolean;
  }
}
