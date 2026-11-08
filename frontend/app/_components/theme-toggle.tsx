"use client";

import { useTheme, useTranslation } from "@/lib/preferences";
import { IconMoon, IconSun } from "./icons";

/**
 * Light / dark switch. A real switch (role="switch" with aria-checked) whose name is "Dark mode",
 * so assistive technology announces "Dark mode, switch, on/off". The sun and moon are decoration.
 */
export function ThemeToggle() {
  const [theme, setTheme] = useTheme();
  const { t } = useTranslation();
  const dark = theme === "dark";

  return (
    <button
      type="button"
      role="switch"
      aria-checked={dark}
      onClick={() => setTheme(dark ? "light" : "dark")}
      className="lift relative h-10 w-10 shrink-0 cursor-pointer rounded-full border border-white/35 bg-white/10 hover:bg-white/20 sm:w-[4.75rem]"
    >
      <span className="sr-only">{t.site.themeLabel}</span>
      {/* On phones the switch is a compact round button; the sun/moon track appears from "sm" up. */}
      <IconSun className="absolute left-2.5 top-1/2 hidden h-4 w-4 -translate-y-1/2 text-amber-200 sm:block" />
      <IconMoon className="absolute right-2.5 top-1/2 hidden h-4 w-4 -translate-y-1/2 text-indigo-200 sm:block" />
      <span
        aria-hidden="true"
        className={`absolute left-1 top-1 grid h-8 w-8 place-items-center rounded-full bg-white shadow-md transition-transform duration-300 motion-reduce:transition-none ${
          dark ? "sm:translate-x-[2.25rem]" : ""
        }`}
      >
        {dark ? <IconMoon className="h-4 w-4 text-indigo-700" /> : <IconSun className="h-4 w-4 text-amber-600" />}
      </span>
    </button>
  );
}
