import { getIntakePrefill, getMeasuredBurn } from "@/features/intake/actions/intake";
import type { MeasuredBurn } from "@/features/intake/actions/measured-burn.utils";
import { TimezoneRefresh } from "@/components/layout/timezone-refresh";
import { todayLocalDateString } from "@/lib/date/day-bounds";
import { requestTimezone } from "@/lib/date/request-timezone";

import { IntakeForm } from "./intake-form";

// The measured figure only narrows the range, so a failed read falls back to
// the formula figure rather than failing the page.
const readMeasuredBurn = (timezone: string): Promise<MeasuredBurn | null> =>
  getMeasuredBurn(timezone).catch((error: unknown) => {
    console.error("Loading measured burn failed", error);
    return null;
  });

// Server-rendered prefill and measured burn, read together: every stored
// answer and the narrowed range are on the first paint, so a returning user
// never watches the form fill itself in.
const EstimatePage = async () => {
  const timezone = await requestTimezone();
  if (!timezone) {
    return <TimezoneRefresh />;
  }
  const [prefill, measured] = await Promise.all([getIntakePrefill(), readMeasuredBurn(timezone)]);
  return <IntakeForm prefill={prefill} today={todayLocalDateString(timezone)} measured={measured} />;
};

export default EstimatePage;
