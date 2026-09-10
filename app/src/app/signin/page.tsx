// app/src/app/signin/page.tsx
"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";
import { signIn } from "next-auth/react";

import { Button } from "@/components/button";
import { Field } from "@/components/field";
import { InlineMessage } from "@/components/inline-message";

const submitSignIn = async (
  formData: FormData,
  router: ReturnType<typeof useRouter>,
  setError: (message: string | null) => void,
): Promise<void> => {
  const result = await signIn("credentials", {
    email: formData.get("email"),
    password: formData.get("password"),
    redirect: false,
  });
  if (result?.error) {
    setError("Invalid email or password");
    return;
  }
  router.push("/");
};

interface SignInCardProps {
  error: string | null;
  pending: boolean;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}

// autoComplete lets a password manager fill this reliably - "current-password"
// (not "new-password") because this is the sign-in form (found via
// /accessibility, 2026-09-10).
const SignInCard = ({ error, pending, onSubmit }: SignInCardProps) => (
  <div className="flex flex-col gap-4 rounded-(--radius-surface) border border-border bg-surface p-6">
    <h1 className="text-xl font-semibold text-text">Sign in</h1>
    <form onSubmit={onSubmit} className="flex flex-col gap-3">
      <Field label="Email" name="email" type="email" autoComplete="email" required />
      <Field label="Password" name="password" type="password" autoComplete="current-password" required />
      {error && <InlineMessage tone="error">{error}</InlineMessage>}
      <Button type="submit" pending={pending}>
        Sign in
      </Button>
    </form>
    <Button variant="ghost" disabled title="Google sign-in is not yet configured">
      Continue with Google
    </Button>
  </div>
);

// The brand mark, not UI chrome - spec §2.3 reserves Bricolage Grotesque
// for display headings, and this is the one place in the app that's pure
// wordmark (found via /critique, 2026-09-10).
const Wordmark = () => <p className="text-center font-display text-lg font-semibold text-text">Per100</p>;

const SignInPage = () => {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setPending(true);
    void submitSignIn(new FormData(event.currentTarget), router, setError).finally(() => setPending(false));
  };

  return (
    <main className="mx-auto flex min-h-[100dvh] w-full max-w-sm flex-col justify-center gap-6 px-6">
      <Wordmark />
      <SignInCard error={error} pending={pending} onSubmit={handleSubmit} />
      <Link href="/signup" className="text-center text-sm text-text-muted underline">
        Need an account? Sign up
      </Link>
    </main>
  );
};

export default SignInPage;
