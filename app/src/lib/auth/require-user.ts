import { auth } from "@/auth";

export class NotAuthenticatedError extends Error {
  constructor() {
    super("Not authenticated");
    this.name = "NotAuthenticatedError";
  }
}

export const requireUserId = async (): Promise<string> => {
  const session = await auth();
  if (!session?.user?.id) {
    throw new NotAuthenticatedError();
  }
  return session.user.id;
};
