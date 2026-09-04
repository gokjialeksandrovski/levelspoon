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
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}

const SignInCard = ({ error, onSubmit }: SignInCardProps) => (
  <div className="flex flex-col gap-4 rounded-(--radius-surface) border border-border bg-surface p-6">
    <h1 className="text-xl font-semibold text-text">Sign in</h1>
    <form onSubmit={onSubmit} className="flex flex-col gap-3">
      <Field label="Email" name="email" type="email" required />
      <Field label="Password" name="password" type="password" required />
      {error && <InlineMessage tone="error">{error}</InlineMessage>}
      <Button type="submit">Sign in</Button>
    </form>
    <Button variant="ghost" disabled title="Google sign-in is not yet configured">
      Continue with Google
    </Button>
  </div>
);

const SignInPage = () => {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    void submitSignIn(new FormData(event.currentTarget), router, setError);
  };

  return (
    <main className="mx-auto flex min-h-[100dvh] w-full max-w-sm flex-col justify-center gap-6 px-6">
      <p className="text-center text-lg font-semibold text-text">Per100</p>
      <SignInCard error={error} onSubmit={handleSubmit} />
      <Link href="/signup" className="text-center text-sm text-text-muted underline">
        Need an account? Sign up
      </Link>
    </main>
  );
};

export default SignInPage;
