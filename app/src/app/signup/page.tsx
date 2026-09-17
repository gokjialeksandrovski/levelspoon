"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { type SubmitEvent, useState } from "react";
import { signIn } from "next-auth/react";

import { registerUser } from "@/features/auth/actions/auth";
import type { RegisterUserResult } from "@/features/auth/actions/auth";
import { MIN_PASSWORD_LENGTH } from "@/features/auth/actions/auth.utils";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { InlineMessage } from "@/components/ui/inline-message";
import { PasswordField } from "@/components/ui/password-field";
import { Wordmark } from "@/components/ui/wordmark";

const PASSWORD_RULE = `At least ${MIN_PASSWORD_LENGTH} characters.`;

// Each refusal says what to do next - "already exists" without the sign-in
// route leaves the user retyping the same address.
const REGISTRATION_MESSAGES: Record<Exclude<RegisterUserResult["status"], "created">, string> = {
  email_taken: "That email already has an account. Sign in instead, or use another address.",
  password_too_short: `Passwords need ${MIN_PASSWORD_LENGTH} characters or more.`,
};

const submitSignUp = async (formData: FormData, router: ReturnType<typeof useRouter>, setError: (message: string | null) => void): Promise<void> => {
  const email = String(formData.get("email"));
  const password = String(formData.get("password"));
  const name = String(formData.get("name"));

  const registration = await registerUser({ email, password, name });
  if (registration.status !== "created") {
    setError(REGISTRATION_MESSAGES[registration.status]);
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
  onSubmit: (event: SubmitEvent<HTMLFormElement>) => void;
}

// "new-password" here so a password manager offers to generate and save
// one rather than autofilling an existing entry.
const SignUpCard = ({ error, pending, onSubmit }: SignUpCardProps) => (
  <div className="flex flex-col gap-4 rounded-surface border border-border bg-surface p-6">
    <h1 className="font-display text-xl font-semibold text-text">Sign up</h1>
    <form onSubmit={onSubmit} className="flex flex-col gap-3">
      <Field label="Name" name="name" autoComplete="name" required />
      <Field label="Email" name="email" type="email" autoComplete="email" required />
      <PasswordField
        label="Password"
        name="password"
        autoComplete="new-password"
        minLength={MIN_PASSWORD_LENGTH}
        helperText={PASSWORD_RULE}
        required
      />
      {error && <InlineMessage tone="error">{error}</InlineMessage>}
      <Button type="submit" pending={pending}>
        Sign up
      </Button>
    </form>
  </div>
);

const SignUpPage = () => {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const handleSubmit = (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setPending(true);
    // Without the catch a dropped connection rejects silently: the button
    // stops spinning and nothing on screen says why.
    void submitSignUp(new FormData(event.currentTarget), router, setError)
      .catch(() => setError("Could not reach the server. Check your connection and try again."))
      .finally(() => setPending(false));
  };

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-sm flex-col justify-center gap-6 px-6">
      <Wordmark />
      <SignUpCard error={error} pending={pending} onSubmit={handleSubmit} />
      <Link href="/signin" className="text-center text-sm text-text-muted underline">
        Already have an account? Sign in
      </Link>
    </main>
  );
};

export default SignUpPage;
