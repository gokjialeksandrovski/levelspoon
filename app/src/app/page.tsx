"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { todayLocalDateString } from "@/lib/date/day-bounds";

const HomePage = () => {
  const router = useRouter();

  useEffect(() => {
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    router.replace(`/day/${todayLocalDateString(timezone)}`);
  }, [router]);

  return null;
};

export default HomePage;
