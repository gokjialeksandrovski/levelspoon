// app/src/app/signup/page.tsx
"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";
import { signIn } from "next-auth/react";

import { registerUser } from "@/actions/auth";
import { Button } from "@/components/button";
import { Field } from "@/components/field";
import { InlineMessage } from "@/components/inline-message";

const submitSignUp = async (formData: FormData, router: ReturnType<typeof useRouter>, setError: (message: string | null) => void): Promise<void> => {
  const email = String(formData.get("email"));
  const password = String(formData.get("password"));
  const name = String(formData.get("name"));

  try {
    await registerUser({ email, password, name });
  } catch (registrationError) {
    setError(registrationError instanceof Error ? registrationError.message : "Could not create account");
    return;
  }

  const result = await signIn("credentials", { email, password, redirect: false });
  if (result?.error) {
    setError("Account created, but sign-in failed. Please sign in manually.");
    return;
  }
  router.push("/");
};

interface SignUpCardProps {
  error: string | null;
  pending: boolean;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}

// autoComplete values a password manager understands - "new-password" here
// (not "current-password") so it offers to generate and save one rather
// than autofilling an existing entry (found via /accessibility, 2026-09-10).
const SignUpCard = ({ error, pending, onSubmit }: SignUpCardProps) => (
  <div className="flex flex-col gap-4 rounded-(--radius-surface) border border-border bg-surface p-6">
    <h1 className="text-xl font-semibold text-text">Sign up</h1>
    <form onSubmit={onSubmit} className="flex flex-col gap-3">
      <Field label="Name" name="name" autoComplete="name" required />
      <Field label="Email" name="email" type="email" autoComplete="email" required />
      <Field label="Password" name="password" type="password" autoComplete="new-password" required />
      {error && <InlineMessage tone="error">{error}</InlineMessage>}
      <Button type="submit" pending={pending}>
        Sign up
      </Button>
    </form>
  </div>
);

// The brand mark, not UI chrome - spec §2.3 reserves Bricolage Grotesque
// for display headings, and this is the one place in the app that's pure
// wordmark (found via /critique, 2026-09-10).
const Wordmark = () => <p className="text-center font-display text-lg font-semibold text-text">Per100</p>;

const SignUpPage = () => {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setPending(true);
    void submitSignUp(new FormData(event.currentTarget), router, setError).finally(() => setPending(false));
  };

  return (
    <main className="mx-auto flex min-h-[100dvh] w-full max-w-sm flex-col justify-center gap-6 px-6">
      <Wordmark />
      <SignUpCard error={error} pending={pending} onSubmit={handleSubmit} />
      <Link href="/signin" className="text-center text-sm text-text-muted underline">
        Already have an account? Sign in
      </Link>
    </main>
  );
};

export default SignUpPage;
