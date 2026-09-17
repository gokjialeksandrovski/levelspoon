// Errors already announce through role="alert" (Field, InlineMessage); this
// is the missing other half - the polite region for success and progress,
// which nothing covered (WCAG 4.1.3 Status Messages).
// Always rendered, never conditionally mounted: a live region has to exist
// before its text changes or assistive tech has nothing to watch.
export const LiveStatus = ({ message }: { message: string }) => (
  <p role="status" aria-live="polite" className="sr-only">
    {message}
  </p>
);
