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
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}

const SignUpCard = ({ error, onSubmit }: SignUpCardProps) => (
  <div className="flex flex-col gap-4 rounded-(--radius-surface) border border-border bg-surface p-6">
    <h1 className="text-xl font-semibold text-text">Sign up</h1>
    <form onSubmit={onSubmit} className="flex flex-col gap-3">
      <Field label="Name" name="name" required />
      <Field label="Email" name="email" type="email" required />
      <Field label="Password" name="password" type="password" required />
      {error && <InlineMessage tone="error">{error}</InlineMessage>}
      <Button type="submit">Sign up</Button>
    </form>
    <Button variant="ghost" disabled title="Google sign-in is not yet configured">
      Continue with Google
    </Button>
  </div>
);

const SignUpPage = () => {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    void submitSignUp(new FormData(event.currentTarget), router, setError);
  };

  return (
    <main className="mx-auto flex min-h-[100dvh] w-full max-w-sm flex-col justify-center gap-6 px-6">
      <p className="text-center text-lg font-semibold text-text">Per100</p>
      <SignUpCard error={error} onSubmit={handleSubmit} />
      <Link href="/signin" className="text-center text-sm text-text-muted underline">
        Already have an account? Sign in
      </Link>
    </main>
  );
};

export default SignUpPage;
