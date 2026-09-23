// The day comes from the browser, so a malformed or future one is a slipped
// URL or a tampered call rather than anything a screen can produce - it is
// refused loudly rather than quietly filed under today.
export class InvalidLogDateError extends Error {
  constructor(logDate: string) {
    super(`Cannot log a meal for ${logDate}`);
    this.name = "InvalidLogDateError";
  }
}

export class NotAuthorizedError extends Error {
  constructor() {
    super("You do not have access to this meal");
    this.name = "NotAuthorizedError";
  }
}
