import type { ReactNode } from "react";
import Link from "next/link";

import { IconProvider } from "@/components/ui/icon-provider";

// First Tab stop, off-screen until focused, so a keyboard user can skip the
// header's controls straight to content. Each screen's <main> carries the
// matching id="main-content" and tabIndex={-1}.
const SkipToContentLink = () => (
  <Link
    href="#main-content"
    className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-control focus:border focus:border-border focus:bg-surface focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-text focus:outline focus:outline-2 focus:outline-offset-2 focus:outline-text"
  >
    Skip to content
  </Link>
);

// overflow-x-clip contains the slide-in transition's horizontal flash.
// `clip` (not `hidden`) leaves vertical scroll and the sticky action bar
// alone - it doesn't create a scroll container.
const AppLayout = ({ children }: { children: ReactNode }) => (
  <IconProvider>
    <div className="mx-auto flex min-h-dvh max-w-md flex-col overflow-x-clip">
      <SkipToContentLink />
      {children}
    </div>
  </IconProvider>
);

export default AppLayout;
