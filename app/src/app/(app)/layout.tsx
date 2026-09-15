import type { ReactNode } from "react";

import { IconProvider } from "@/components/ui/icon-provider";

// Sits before the header on every screen in the app group. Off-screen until
// focused, then it's the first Tab stop - so a keyboard-only user can jump
// straight past the header's day-nav / history / account controls to the
// screen's content instead of tabbing through them on every page (found via
// /accessibility, 2026-09-10). Each screen's <main> carries the matching
// id="main-content" and tabIndex={-1} so focus actually lands there.
const SkipToContentLink = () => (
  <a
    href="#main-content"
    className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-control focus:border focus:border-border focus:bg-surface focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-text focus:outline focus:outline-2 focus:outline-offset-2 focus:outline-text"
  >
    Skip to content
  </a>
);

// overflow-x-clip contains the day-view / wizard slide-in (motion.main
// enters from x:24), which otherwise flashes a horizontal scrollbar for the
// length of the transition on every navigation (found via /critique,
// 2026-09-10). `clip` (not `hidden`) leaves vertical scroll and the sticky
// action bar alone - it doesn't create a scroll container.
const AppLayout = ({ children }: { children: ReactNode }) => (
  <IconProvider>
    <div className="mx-auto flex min-h-dvh max-w-md flex-col overflow-x-clip">
      <SkipToContentLink />
      {children}
    </div>
  </IconProvider>
);

export default AppLayout;
