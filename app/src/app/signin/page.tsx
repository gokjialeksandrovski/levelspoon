"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { type SubmitEvent, useState } from "react";
import { signIn } from "next-auth/react";

import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { InlineMessage } from "@/components/ui/inline-message";
import { PasswordField } from "@/components/ui/password-field";
import { Wordmark } from "@/components/ui/wordmark";

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
  onSubmit: (event: SubmitEvent<HTMLFormElement>) => void;
}

// "current-password", not "new-password", since this is the sign-in form.
const SignInCard = ({ error, pending, onSubmit }: SignInCardProps) => (
  <div className="flex flex-col gap-4 rounded-surface border border-border bg-surface p-6">
    <h1 className="font-display text-xl font-semibold text-text">Sign in</h1>
    <form onSubmit={onSubmit} className="flex flex-col gap-3">
      <Field label="Email" name="email" type="email" autoComplete="email" required />
      <PasswordField label="Password" name="password" autoComplete="current-password" required />
      {error && <InlineMessage tone="error">{error}</InlineMessage>}
      <Button type="submit" pending={pending}>
        Sign in
      </Button>
    </form>
  </div>
);

const SignInPage = () => {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const handleSubmit = (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setPending(true);
    // Without the catch a dropped connection rejects silently: the button
    // stops spinning and nothing on screen says why.
    void submitSignIn(new FormData(event.currentTarget), router, setError)
      .catch(() => setError("Could not reach the server. Check your connection and try again."))
      .finally(() => setPending(false));
  };

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-sm flex-col justify-center gap-6 px-6">
      <Wordmark />
      <SignInCard error={error} pending={pending} onSubmit={handleSubmit} />
      <Link href="/signup" className="text-center text-sm text-text-muted underline">
        Need an account? Sign up
      </Link>
    </main>
  );
};

export default SignInPage;
