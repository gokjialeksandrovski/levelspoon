"use client";

import { useSession } from "next-auth/react";

// Hides what the server refuses a demo user anyway (lib/auth/require-user.ts).
// The root layout seeds the session, so this is right on first paint.
export const useIsGuest = (): boolean => useSession().data?.user?.isGuest === true;
