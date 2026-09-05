import type { Metadata, Viewport } from "next";
import { Bricolage_Grotesque, Karla } from "next/font/google";

import "./globals.css";

import { Providers } from "./providers";

const bricolage = Bricolage_Grotesque({
  subsets: ["latin"],
  variable: "--font-bricolage",
});

const karla = Karla({
  subsets: ["latin"],
  variable: "--font-karla",
});

export const metadata: Metadata = {
  title: "Per100",
  description: "Log meals by their nutrition per 100g",
};

export const viewport: Viewport = {
  colorScheme: "light dark",
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#12110d" },
    { media: "(prefers-color-scheme: light)", color: "#faf8f3" },
  ],
};

const RootLayout = ({ children }: Readonly<{ children: React.ReactNode }>) => (
  <html lang="en" className={`${bricolage.variable} ${karla.variable}`}>
    <body className="min-h-[100dvh] bg-bg font-sans text-text antialiased">
      <Providers>{children}</Providers>
    </body>
  </html>
);

export default RootLayout;
