import type { Metadata } from "next";

import "./globals.css";

export const metadata: Metadata = {
  title: "Per100",
  description: "Log meals by their nutrition per 100g",
};

const RootLayout = ({ children }: Readonly<{ children: React.ReactNode }>) => (
  <html lang="en">
    <body className="min-h-screen bg-white text-gray-900">{children}</body>
  </html>
);

export default RootLayout;
