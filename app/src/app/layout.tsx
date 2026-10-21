import type { Metadata, Viewport } from "next";
import { Bricolage_Grotesque, Karla } from "next/font/google";

import "./globals.css";

import { Providers } from "./providers";
import { THEME_INIT_SCRIPT } from "@/lib/theme/theme";

const bricolage = Bricolage_Grotesque({
  subsets: ["latin"],
  variable: "--font-bricolage",
});

const karla = Karla({
  subsets: ["latin"],
  variable: "--font-karla",
});

export const metadata: Metadata = {
  title: "levelspoon",
  description: "Log meals by their nutrition per 100g",
};

export const viewport: Viewport = {
  colorScheme: "light dark",
  // These hexes must be kept in sync with --raw-bg in globals.css by hand -
  // a <meta> viewport value can't reference a CSS custom property, which is
  // exactly how this pair drifted stale after the last re-theme.
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#1a1816" },
    { media: "(prefers-color-scheme: light)", color: "#fdfbf7" },
  ],
};

const RootLayout = ({ children }: Readonly<{ children: React.ReactNode }>) => (
  // suppressHydrationWarning: the init script below sets data-theme before
  // React hydrates, which the server-rendered markup can't know about.
  <html lang="en" className={`${bricolage.variable} ${karla.variable}`} suppressHydrationWarning>
    <head>
      {/* Blocking (not async/defer) - must run before first paint to avoid a
          flash of the wrong theme when the user has an explicit override. */}
      <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
    </head>
    <body className="min-h-dvh bg-bg font-sans text-text antialiased">
      <Providers>{children}</Providers>
    </body>
  </html>
);

export default RootLayout;
