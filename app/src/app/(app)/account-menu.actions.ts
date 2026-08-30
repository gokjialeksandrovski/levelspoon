"use server";

import { signOut } from "@/auth";

export const signOutAction = async (): Promise<void> => {
  await signOut({ redirectTo: "/signin" });
};
