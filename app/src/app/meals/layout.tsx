// app/src/app/meals/layout.tsx
import type { ReactNode } from "react";

import { signOut } from "@/auth";

const MealsLayout = ({ children }: { children: ReactNode }) => (
  <div className="min-h-screen">
    <header className="flex items-center justify-between border-b p-4">
      <span className="font-semibold">Per100</span>
      <form
        action={async () => {
          "use server";
          await signOut({ redirectTo: "/signin" });
        }}
      >
        <button type="submit" className="text-sm text-gray-600 underline">
          Sign out
        </button>
      </form>
    </header>
    <main className="p-4">{children}</main>
  </div>
);

export default MealsLayout;
