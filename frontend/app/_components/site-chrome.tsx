"use client";

import { useEffect, type ReactNode } from "react";
import { useTranslation } from "@/lib/preferences";
import { IconLogo, IconSparkles } from "./icons";
import { LanguageSelect } from "./language-select";
import { ThemeToggle } from "./theme-toggle";

/** The frame around every page: skip link, header with the language and theme controls, footer. */
export function SiteChrome({ children }: { children: ReactNode }) {
  const { language, t } = useTranslation();

  // Keep the page language in step with the chosen language.
  useEffect(() => {
    document.documentElement.lang = language;
  }, [language]);

  return (
    <div className="bg-page relative isolate flex min-h-screen flex-col overflow-x-clip">
      {/* The browser tab title, in the chosen language. React moves this into <head> and keeps it
          updated. (It is not in the Next.js metadata on purpose: that would overwrite it again.) */}
      <title>{`${t.page.docTitle} · ProcureFlow AI`}</title>
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-surface focus:px-4 focus:py-2 focus:font-medium focus:text-brand focus:shadow-card"
      >
        {t.site.skipToContent}
      </a>

      <header className="bg-header relative z-20 text-white">
        {/* Phones: logo and controls on the first row, the development badge on its own second row.
            From the "sm" width up: one row with logo, badge and controls. */}
        <div className="mx-auto grid max-w-5xl grid-cols-[1fr_auto] items-center gap-x-4 gap-y-3 px-4 py-3 sm:flex sm:px-6">
          <div className="col-start-1 row-start-1 flex min-w-0 items-center gap-2.5">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white/15 ring-1 ring-white/30">
              <IconLogo className="h-6 w-6 text-white" />
            </span>
            <p className="truncate text-base font-semibold tracking-tight sm:text-lg">
              ProcureFlow <span className="text-cyan-200">AI</span>
            </p>
          </div>

          <p className="col-span-2 row-start-2 inline-flex items-center gap-1.5 justify-self-start rounded-full bg-amber-300/15 px-3 py-1 text-xs font-medium text-amber-100 ring-1 ring-amber-200/40">
            <IconSparkles className="h-3.5 w-3.5 shrink-0" />
            <span>{t.site.devBadge}</span>
          </p>

          <div className="col-start-2 row-start-1 flex items-center gap-2 sm:ml-auto">
            <LanguageSelect />
            <ThemeToggle />
          </div>
        </div>
      </header>

      <main id="main" tabIndex={-1} className="flex-1">
        {children}
      </main>

      <footer className="border-t border-line bg-surface/80 backdrop-blur">
        <p className="mx-auto flex max-w-5xl items-center gap-2 px-4 py-4 text-sm text-muted sm:px-6">
          <IconSparkles className="h-4 w-4 shrink-0 text-brand" />
          <span>{t.site.footer}</span>
        </p>
      </footer>
    </div>
  );
}
