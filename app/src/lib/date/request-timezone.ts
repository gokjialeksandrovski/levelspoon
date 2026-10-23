import { cookies } from "next/headers";

import { TIMEZONE_COOKIE } from "./timezone-cookie";

const isKnownTimezone = (timezone: string): boolean => {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: timezone });
    return true;
  } catch {
    return false;
  }
};

// Null when the cookie is missing (the first request before the head script
// ran) or names no real zone: the cookie is client input, and an unknown zone
// would make every day-bounds call throw.
export const requestTimezone = async (): Promise<string | null> => {
  const timezone = (await cookies()).get(TIMEZONE_COOKIE)?.value;
  return timezone && isKnownTimezone(timezone) ? timezone : null;
};
