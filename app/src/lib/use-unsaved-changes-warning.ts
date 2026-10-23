import { useEffect } from "react";

// The browser's own leave-page prompt on reload or tab close while a form
// holds typed changes. In-app links are not covered: the App Router has no
// navigation-blocking API, and the forms' Back controls are deliberate exits.
export const useUnsavedChangesWarning = (isDirty: boolean): void => {
  useEffect(() => {
    if (!isDirty) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [isDirty]);
};
