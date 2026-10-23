import Link from "next/link";

import { DemoTerms, SelfHostNote } from "@/features/demo/components/demo-terms";
import { TAP_HIT_AREA_SM } from "@/components/ui/tap-target";
import { Wordmark } from "@/components/ui/wordmark";

import { StartDemo } from "./start-demo";

const LINK_CLASS = `${TAP_HIT_AREA_SM} text-sm text-text-muted underline`;

// Read before entering, not after: the terms decide whether a visitor wants
// the demo or an account.
const DemoPage = () => (
  <main className="mx-auto flex min-h-dvh w-full max-w-sm flex-col justify-center gap-6 px-6 py-10">
    <Wordmark />
    <section className="flex flex-col gap-6 rounded-surface border border-border bg-surface p-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-balance font-display text-xl font-semibold text-text">Try it without an account</h1>
        <p className="text-pretty text-sm text-text-muted">You can log meals right away, with these limits.</p>
      </div>
      <DemoTerms />
      <SelfHostNote />
      <StartDemo />
    </section>
    {/* gap-3 overlaps the two 44px hit areas by 12px; gap-6 avoided that but read as two separate blocks. */}
    <nav aria-label="Account" className="flex flex-col items-center gap-3">
      <Link href="/signup" className={LINK_CLASS}>
        <span>Make an account</span>
      </Link>
      <Link href="/signin" className={LINK_CLASS}>
        <span>Sign in</span>
      </Link>
    </nav>
  </main>
);

export default DemoPage;
