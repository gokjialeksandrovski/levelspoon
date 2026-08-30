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

  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-bg text-text">
      <p className="text-lg font-semibold tracking-tight">Per100</p>
    </div>
  );
};

export default HomePage;
