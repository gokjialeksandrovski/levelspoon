import type { Metadata, Viewport } from "next";
import { Bricolage_Grotesque, Karla } from "next/font/google";

import "./globals.css";

import { Providers } from "./providers";
import { TIMEZONE_INIT_SCRIPT } from "@/lib/date/timezone-cookie";
import { THEME_COLORS, THEME_INIT_SCRIPT } from "@/lib/theme/theme";

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
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: THEME_COLORS.dark },
    { media: "(prefers-color-scheme: light)", color: THEME_COLORS.light },
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
      <script dangerouslySetInnerHTML={{ __html: TIMEZONE_INIT_SCRIPT }} />
    </head>
    <body className="min-h-dvh bg-bg font-sans text-text antialiased">
      <Providers>{children}</Providers>
    </body>
  </html>
);

export default RootLayout;
