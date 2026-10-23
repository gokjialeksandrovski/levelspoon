"use client";

import { useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { UserCircleIcon } from "@phosphor-icons/react";

import { DemoTerms, SelfHostNote } from "@/features/demo/components/demo-terms";
import { Button, buttonClassName } from "@/components/ui/button";
import { Sheet } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { FOCUS_RING, ICON_TAP_TARGET_CLASS } from "@/components/ui/tap-target";

import { signOutAction } from "./account-menu.actions";

// `session` starts undefined while next-auth resolves the client session
// (Auth.js types `user.email` as nullable); a line-height skeleton holds the
// row so the sign-out button doesn't jump when the address lands.
const AccountEmail = ({ email }: { email: string | null | undefined }) =>
  email ? <p className="mb-4 text-sm text-text-muted">{email}</p> : <Skeleton className="mb-4 h-5 w-48" />;

const AccountSheetBody = ({ email }: { email: string | null | undefined }) => (
  <>
    <AccountEmail email={email} />
    <form action={signOutAction}>
      <Button variant="ghost" type="submit">
        Sign out
      </Button>
    </form>
  </>
);

// Ending strands the log for good with no undo, so the first tap only arms
// it. Keep is the exit and sends nothing.
const EndDemoForm = () => {
  const [isArmed, setIsArmed] = useState(false);
  return (
    <form action={signOutAction} className="flex flex-col gap-3">
      <p className="text-pretty text-sm text-text-muted">End demo signs this browser out, and you can&apos;t open this log again.</p>
      {isArmed ? (
        <div className="flex gap-3">
          <Button variant="danger" type="submit" className="flex-1">
            End it for good
          </Button>
          <Button variant="ghost" className="flex-1" onClick={() => setIsArmed(false)}>
            Keep the demo
          </Button>
        </div>
      ) : (
        <Button variant="danger" onClick={() => setIsArmed(true)}>
          End demo
        </Button>
      )}
    </form>
  );
};

// A guest has no email to show, and signing out strands the log for good,
// so the sheet repeats the demo terms and names that cost on the button.
const DemoSheetBody = () => (
  <div className="flex flex-col gap-6">
    <DemoTerms />
    <SelfHostNote />
    <div className="flex flex-col gap-3">
      <Link href="/signup" className={buttonClassName("primary", "text-center")}>
        Make an account
      </Link>
      <p className="text-pretty text-sm text-text-muted">A new account starts with an empty log. This demo log stays where it is.</p>
    </div>
    <EndDemoForm />
  </div>
);

// Text, not the account icon: the header is the one place that always shows,
// so it is where a guest sees they are in the demo. pr-[19px] puts the pill
// back on the page edge: the icon row pulls 11px into the margin (right for a
// centred glyph, not a pill), and -space-x-2 takes 8px more, because the
// Sheet's dialog after this button makes it a non-last child.
const DemoTrigger = ({ open, onOpen }: { open: boolean; onOpen: () => void }) => (
  <button type="button" onClick={onOpen} aria-expanded={open} className={`group flex min-h-11 items-center pl-2 pr-[19px] ${FOCUS_RING}`}>
    <span className="rounded-full border border-border px-2.5 py-1 text-xs font-medium text-text-muted transition-colors group-hover:bg-surface-raised group-hover:text-text">
      Demo
    </span>
  </button>
);

export const AccountMenu = () => {
  const [open, setOpen] = useState(false);
  const { data: session } = useSession();
  const isGuest = session?.user?.isGuest === true;

  return (
    <>
      {isGuest ? (
        <DemoTrigger open={open} onOpen={() => setOpen(true)} />
      ) : (
        <button type="button" onClick={() => setOpen(true)} aria-label="Account" aria-expanded={open} className={ICON_TAP_TARGET_CLASS}>
          <UserCircleIcon />
        </button>
      )}
      <Sheet open={open} onClose={() => setOpen(false)} title={isGuest ? "Demo" : "Account"}>
        {isGuest ? <DemoSheetBody /> : <AccountSheetBody email={session?.user?.email} />}
      </Sheet>
    </>
  );
};
