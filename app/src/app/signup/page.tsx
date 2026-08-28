// app/src/app/signup/page.tsx
"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";
import { signIn } from "next-auth/react";

import { registerUser } from "@/actions/auth";
import { FormField } from "@/components/form-field";

const SignUpPage = () => {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    const formData = new FormData(event.currentTarget);
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
    router.push("/meals/new");
  };

  return (
    <main className="mx-auto flex max-w-sm flex-col gap-4 p-6">
      <h1 className="text-xl font-semibold">Sign up</h1>
      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <FormField label="Name" name="name" required />
        <FormField label="Email" name="email" type="email" required />
        <FormField label="Password" name="password" type="password" required />
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button type="submit" className="rounded bg-blue-600 px-4 py-2 text-white">
          Sign up
        </button>
      </form>
      <Link href="/signin" className="text-sm text-blue-600">
        Already have an account? Sign in
      </Link>
    </main>
  );
};

export default SignUpPage;
