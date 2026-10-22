import { DEMO_IDLE_DAYS, DEMO_SCANS_PER_IP_PER_DAY } from "@/lib/demo/limits";

// Every line here is enforced by the server (lib/auth/require-user.ts,
// lib/db/demo-quota.ts, createProduct): change one side, change both.
const TERMS = [
  {
    term: "Your products stay yours",
    detail: "Products you add don't go into the shared list, so nobody else sees them. The app reads your label photos and doesn't keep them.",
  },
  {
    term: "No AI",
    detail: "Lazy track and the photo amount guess are turned off.",
  },
  {
    term: `${DEMO_SCANS_PER_IP_PER_DAY} label scans a day`,
    detail: "Typing a name, scanning a barcode and picking a standard food don't count toward it.",
  },
  {
    term: `Kept ${DEMO_IDLE_DAYS} days after your last visit`,
    detail: `Your log sits on the developer's server, and only this browser can open it. Stay away ${DEMO_IDLE_DAYS} days and the server deletes it.`,
  },
] as const;

export const DemoTerms = () => (
  <dl className="flex flex-col divide-y divide-border">
    {TERMS.map(({ term, detail }) => (
      <div key={term} className="flex flex-col gap-1 py-3 first:pt-0 last:pb-0">
        <dt className="text-sm font-medium text-text">{term}</dt>
        <dd className="text-pretty text-sm text-text-muted">{detail}</dd>
      </div>
    ))}
  </dl>
);

export const SelfHostNote = () => (
  <p className="text-pretty text-sm text-text">
    <span className="font-medium">Self-host levelspoon and none of this applies.</span>{" "}
    <span className="text-text-muted">AI then runs on your own API key.</span>
  </p>
);
