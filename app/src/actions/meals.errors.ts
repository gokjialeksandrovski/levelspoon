export class NotAuthorizedError extends Error {
  constructor() {
    super("You do not have access to this meal");
    this.name = "NotAuthorizedError";
  }
}
