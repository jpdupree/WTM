import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "WTM Dashboard",
  description: "World's Toughest Mudder live race dashboard",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="font-display antialiased">{children}</body>
    </html>
  );
}
