import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { SiteChrome } from "./_components/site-chrome";
import "./globals.css";

// No "title" here: the tab title depends on the chosen language, so site-chrome.tsx renders it.
export const metadata: Metadata = {
  description: "ProcureFlow AI development preview. Synthetic data only.",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    // suppressHydrationWarning: /theme-init.js sets data-theme, color-scheme and lang on <html>
    // before React starts, so those attributes may legitimately differ from the server's HTML.
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Deliberately a blocking script: it must run before the first paint so a returning visitor
            never sees a flash of the wrong theme. It is a same-origin file (public/theme-init.js). */}
        {/* eslint-disable-next-line @next/next/no-sync-scripts */}
        <script src="/theme-init.js" />
      </head>
      <body className="antialiased">
        <SiteChrome>{children}</SiteChrome>
      </body>
    </html>
  );
}
