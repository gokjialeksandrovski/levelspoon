import { auth } from "@/auth";

export class NotAuthenticatedError extends Error {
  constructor() {
    super("Not authenticated");
    this.name = "NotAuthenticatedError";
  }
}

// Backstop, not a user-facing refusal: no demo screen offers an action that
// throws this.
export class GuestNotAllowedError extends Error {
  constructor() {
    super("Not available in demo mode");
    this.name = "GuestNotAllowedError";
  }
}

export interface SessionUser {
  id: string;
  isGuest: boolean;
}

export const requireUser = async (): Promise<SessionUser> => {
  const session = await auth();
  if (!session?.user?.id) {
    throw new NotAuthenticatedError();
  }
  return { id: session.user.id, isGuest: session.user.isGuest === true };
};

export const requireUserId = async (): Promise<string> => (await requireUser()).id;

/** For actions a demo user never gets: AI calls, and writes that would put a
 * guest's photo or barcode into the shared table. */
export const requireAccountUserId = async (): Promise<string> => {
  const user = await requireUser();
  if (user.isGuest) {
    throw new GuestNotAllowedError();
  }
  return user.id;
};
