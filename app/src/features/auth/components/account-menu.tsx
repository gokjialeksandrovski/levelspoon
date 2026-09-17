"use client";

import { useState } from "react";
import { useSession } from "next-auth/react";
import { UserCircleIcon } from "@phosphor-icons/react";

import { Button } from "@/components/ui/button";
import { Sheet } from "@/components/ui/sheet";
import { ICON_TAP_TARGET_CLASS } from "@/components/ui/tap-target";

import { signOutAction } from "./account-menu.actions";

// `session` starts undefined while next-auth resolves the client session
// (Auth.js types `user.email` as nullable), so this reads "..." briefly.
const AccountEmail = ({ email }: { email: string | null | undefined }) => (
  <p className="mb-4 text-sm text-text-muted">{email ?? "..."}</p>
);

export const AccountMenu = () => {
  const [open, setOpen] = useState(false);
  const { data: session } = useSession();
  const email = session?.user?.email;

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} aria-label="Account" aria-expanded={open} className={ICON_TAP_TARGET_CLASS}>
        <UserCircleIcon />
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
