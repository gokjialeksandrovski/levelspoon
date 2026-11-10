// Per-device (localStorage) theme override. Default is "system" - CSS alone
// follows prefers-color-scheme until the user picks an explicit theme here.

type Theme = "system" | "light" | "dark";

const THEME_STORAGE_KEY = "levelspoon:theme";

// Must match --raw-bg in globals.css by hand: a <meta> value can't read a CSS
// custom property.
export const THEME_COLORS = { light: "#fdfbf7", dark: "#1a1816" } as const;

const isTheme = (value: string | null): value is Theme =>
  value === "system" || value === "light" || value === "dark";

const listeners = new Set<() => void>();

// useSyncExternalStore's subscribe: localStorage isn't React state, so this
// is how ThemeToggle re-renders when setTheme changes it.
export const subscribeToTheme = (onChange: () => void): (() => void) => {
  listeners.add(onChange);
  return () => listeners.delete(onChange);
};

export const getThemeSnapshot = (): Theme => {
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY);
    return isTheme(stored) ? stored : "system";
  } catch {
    // Private mode / storage disabled - fall back to system preference.
    return "system";
  }
};

// SSR has no localStorage; must match THEME_INIT_SCRIPT's no-op default so
// hydration doesn't flip the icon out from under the first paint.
export const getServerThemeSnapshot = (): Theme => "system";

const themeColorForMedia = (media: string): string =>
  media.includes("dark") ? THEME_COLORS.dark : THEME_COLORS.light;

// The theme-color metas carry prefers-color-scheme media queries, so an
// explicit pick must rewrite their content or the browser chrome follows the OS.
const syncThemeColorMeta = (theme: Theme): void => {
  document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]').forEach((meta) => {
    meta.content = theme === "system" ? themeColorForMedia(meta.media) : THEME_COLORS[theme];
  });
};

// "system" removes the override so the prefers-color-scheme CSS block takes
// back over; "light"/"dark" set the attribute that block guards against.
const applyTheme = (theme: Theme): void => {
  if (theme === "system") {
    delete document.documentElement.dataset.theme;
  } else {
    document.documentElement.dataset.theme = theme;
  }
  syncThemeColorMeta(theme);
};

export const setTheme = (theme: Theme): void => {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // Nothing to persist to; the choice just won't survive a reload.
  }
  applyTheme(theme);
  listeners.forEach((onChange) => onChange());
};

const DARK_SCHEME_QUERY = "(prefers-color-scheme: dark)";

// Resolves "system" to an actual light/dark reading, so the toggle icon
// shows what the theme IS, not a third "auto" glyph. Own store (not folded
// into subscribeToTheme) because this changes when the OS preference
// changes, independent of any localStorage write.
export const subscribeToSystemScheme = (onChange: () => void): (() => void) => {
  const query = window.matchMedia(DARK_SCHEME_QUERY);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
};

export const getSystemSchemeSnapshot = (): boolean => window.matchMedia(DARK_SCHEME_QUERY).matches;

// SSR has no matchMedia; must be a fixed value so hydration's first client
// render matches the server, same reasoning as getServerThemeSnapshot.
export const getServerSystemSchemeSnapshot = (): boolean => false;

// Inlined verbatim into a blocking <script> in layout.tsx so the override
// applies before first paint (no flash of the wrong theme). Keep in sync by
// hand - it can't import this module, it runs before any bundle does. The
// theme-color metas may not be parsed yet, so their rewrite waits for the DOM.
export const THEME_INIT_SCRIPT = `(function(){try{var t=localStorage.getItem(${JSON.stringify(
  THEME_STORAGE_KEY,
)});if(t==="light"||t==="dark"){document.documentElement.dataset.theme=t;var c=${JSON.stringify(
  THEME_COLORS,
)}[t];document.addEventListener("DOMContentLoaded",function(){document.querySelectorAll('meta[name="theme-color"]').forEach(function(m){m.content=c;});});}}catch(e){/* localStorage blocked (private mode): keep the prefers-color-scheme default */}})();`;
