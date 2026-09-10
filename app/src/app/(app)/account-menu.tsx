"use client";

import { useState } from "react";
import { useSession } from "next-auth/react";
import { UserCircle } from "@phosphor-icons/react";

import { Button } from "@/components/button";
import { Sheet } from "@/components/sheet";
import { ICON_TAP_TARGET_CLASS } from "@/components/tap-target";

import { signOutAction } from "./account-menu.actions";

// `session` starts undefined while next-auth resolves the client session
// (and Auth.js types `user.email` itself as nullable), so this reads "..."
// briefly rather than crashing on `session.user.email`.
const AccountEmail = ({ email }: { email: string | null | undefined }) => (
  <p className="mb-4 text-sm text-text-muted">{email ?? "..."}</p>
);

// Split out of AccountMenu purely for the line budget once the 44px hit
// target grew this past a single-line button (ui-ux-pro-max review,
// 2026-09-10).
const AccountTrigger = ({ open, onOpen }: { open: boolean; onOpen: () => void }) => (
  <button type="button" onClick={onOpen} aria-label="Account" aria-expanded={open} className={ICON_TAP_TARGET_CLASS}>
    <UserCircle />
  </button>
);

export const AccountMenu = () => {
  const [open, setOpen] = useState(false);
  const { data: session } = useSession();
  const email = session?.user?.email;

  return (
    <>
      <AccountTrigger open={open} onOpen={() => setOpen(true)} />
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
