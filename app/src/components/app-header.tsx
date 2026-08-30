// app/src/components/app-header.tsx
import Link from "next/link";

import { signOut } from "@/auth";

export const AppHeader = () => (
  <header className="flex items-center justify-between border-b p-4">
    <div className="flex items-center gap-4">
      <span className="font-semibold">Per100</span>
      <Link href="/history" className="text-sm text-blue-600 underline">
        History
      </Link>
    </div>
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
);
