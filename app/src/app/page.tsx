import { redirect } from "next/navigation";

import { TimezoneRefresh } from "@/components/layout/timezone-refresh";
import { todayLocalDateString } from "@/lib/date/day-bounds";
import { requestTimezone } from "@/lib/date/request-timezone";

// Redirects on the server, so opening the app costs one round trip, not a
// bundle download first. The splash shows only on a first request that
// arrived before the timezone cookie existed, until TimezoneRefresh retries.
const HomePage = async () => {
  const timezone = await requestTimezone();
  if (timezone) {
    redirect(`/day/${todayLocalDateString(timezone)}`);
  }

  return (
    <div className="flex min-h-dvh items-center justify-center bg-bg text-text">
      <p className="text-lg font-semibold tracking-tight">levelspoon</p>
      <TimezoneRefresh />
    </div>
  );
};

export default HomePage;
