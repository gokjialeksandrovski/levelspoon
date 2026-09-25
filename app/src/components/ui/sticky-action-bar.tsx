// A step's committing action, pinned to the bottom of the viewport so a long
// form never hides it below the fold. -mx-4 bleeds the rule and background to
// the edges of the page's px-4 column. Same treatment as the estimate's
// result bar and the day view's action bar.
export const StickyActionBar = ({ children }: { children: React.ReactNode }) => (
  <div className="sticky bottom-0 z-10 -mx-4 flex flex-col gap-3 border-t border-border bg-bg px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
    {children}
  </div>
);
