import type { Metadata, Viewport } from "next";
import { Geist } from "next/font/google";

import "./globals.css";

import { Providers } from "./providers";

const geist = Geist({ subsets: ["latin"], variable: "--font-geist" });

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
  <html lang="en" className={geist.variable}>
    <body className="min-h-[100dvh] bg-bg font-sans text-text antialiased">
      <Providers>{children}</Providers>
    </body>
  </html>
);

export default RootLayout;
