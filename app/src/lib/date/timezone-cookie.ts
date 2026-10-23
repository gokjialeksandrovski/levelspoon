// The browser's IANA timezone, carried to the server on every request so a
// Server Component can work out the user's local day before first paint.
// Client-safe: the refresh fallback reads the name, the root layout inlines
// the script.
export const TIMEZONE_COOKIE = "levelspoon-tz";

const ONE_YEAR_SECONDS = 31_536_000;

// Blocking, in <head>, so the cookie is written before any request this page
// makes. Rewritten on every full load, so a device that changes zone carries
// the new one from its next load on.
export const TIMEZONE_INIT_SCRIPT = `(function(){try{document.cookie=${JSON.stringify(
  `${TIMEZONE_COOKIE}=`,
)}+encodeURIComponent(Intl.DateTimeFormat().resolvedOptions().timeZone)+";path=/;max-age=${ONE_YEAR_SECONDS};samesite=lax";}catch(e){/* Intl or cookies unavailable: pages fall back to TimezoneRefresh */}})();`;
