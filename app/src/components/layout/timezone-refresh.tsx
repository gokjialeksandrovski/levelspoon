"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { TIMEZONE_COOKIE } from "@/lib/date/timezone-cookie";

// Rendered by a page whose request arrived without the timezone cookie. The
// head script has written it by the time this hydrates, so one refresh brings
// the real page. No refresh when the cookie still isn't there (cookies
// blocked), or it would loop.
export const TimezoneRefresh = () => {
  const router = useRouter();
  useEffect(() => {
    if (document.cookie.includes(`${TIMEZONE_COOKIE}=`)) router.refresh();
  }, [router]);
  return null;
};
