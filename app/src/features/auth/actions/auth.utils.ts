// Lives here, not in auth.ts: auth.ts is "use server", which may only export
// async functions - and the sign-up form states this rule before the user
// types, so both sides have to read the same number.
export const MIN_PASSWORD_LENGTH = 8;
