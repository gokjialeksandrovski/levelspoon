// app/src/app/meals/new/page.tsx
"use client";

import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";

import { createMeal } from "@/actions/meals";
import { FormField } from "@/components/form-field";

const NewMealPage = () => {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    const formData = new FormData(event.currentTarget);
    const name = String(formData.get("name"));

    try {
      const { mealId } = await createMeal({ name });
      router.push(`/meals/${mealId}`);
    } catch {
      setError("Could not create meal. Please try again.");
    }
  };

  return (
    <div className="mx-auto flex max-w-sm flex-col gap-4">
      <h1 className="text-xl font-semibold">Name this meal</h1>
      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <FormField label="Meal name" name="name" required />
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button type="submit" className="rounded bg-blue-600 px-4 py-2 text-white">
          Start
        </button>
      </form>
    </div>
  );
};

export default NewMealPage;
