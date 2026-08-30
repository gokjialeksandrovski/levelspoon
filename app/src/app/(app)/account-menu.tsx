"use client";

import { useState } from "react";
import { useSession } from "next-auth/react";
import { UserCircle } from "@phosphor-icons/react";

import { Button } from "@/components/button";
import { Sheet } from "@/components/sheet";

import { signOutAction } from "./account-menu.actions";

// `session` starts undefined while next-auth resolves the client session
// (and Auth.js types `user.email` itself as nullable), so this reads "..."
// briefly rather than crashing on `session.user.email`.
const AccountEmail = ({ email }: { email: string | null | undefined }) => (
  <p className="mb-4 text-sm text-text-muted">{email ?? "..."}</p>
);

export const AccountMenu = () => {
  const [open, setOpen] = useState(false);
  const { data: session } = useSession();
  const email = session?.user?.email;

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} aria-label="Account">
        <UserCircle />
      </button>
      <Sheet open={open} onClose={() => setOpen(false)} title="Account">
        <AccountEmail email={email} />
        <form action={signOutAction}>
          <Button variant="ghost" type="submit">
            Sign out
          </Button>
        </form>
      </Sheet>
    </>
  );
};
