"use client";

import { LANGUAGES, isLanguage } from "@/lib/i18n";
import { useLanguage, useTranslation } from "@/lib/preferences";
import { IconChevronDown, IconGlobe } from "./icons";

/**
 * Language selector: English (default), Deutsch, Русский, Español.
 * A native <select>, so it works with keyboard, touch and screen readers everywhere.
 * Each language is written in its own name, and tagged with lang so it is pronounced correctly.
 */
export function LanguageSelect() {
  const [language, setLanguage] = useLanguage();
  const { t } = useTranslation();

  return (
    <div className="relative">
      <label htmlFor="site-language" className="sr-only">
        {t.site.languageLabel}
      </label>
      {/* The globe is dropped on phones to leave room for the product name. */}
      <IconGlobe className="pointer-events-none absolute left-3 top-1/2 hidden h-4 w-4 -translate-y-1/2 text-white sm:block" />
      <select
        id="site-language"
        value={language}
        onChange={(event) => {
          if (isLanguage(event.target.value)) setLanguage(event.target.value);
        }}
        className="lift h-10 cursor-pointer appearance-none rounded-full border border-white/35 bg-white/10 py-0 pl-3.5 pr-7 text-sm font-medium text-white hover:bg-white/20 sm:pl-9 sm:pr-9 [&>option]:bg-white [&>option]:text-slate-900"
      >
        {LANGUAGES.map((item) => (
          <option key={item.code} value={item.code} lang={item.code}>
            {item.nativeName}
          </option>
        ))}
      </select>
      <IconChevronDown className="pointer-events-none absolute right-2 top-1/2 h-4 w-4 -translate-y-1/2 text-white sm:right-3" />
    </div>
  );
}
