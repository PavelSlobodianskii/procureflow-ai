import { useSyncExternalStore } from "react";
import { DEFAULT_LANGUAGE, DICTIONARIES, isLanguage, type Dictionary, type Language } from "./i18n";

/**
 * The user's theme and language, stored only in this browser (localStorage).
 * Nothing is sent anywhere. If the browser blocks storage (for example a private window),
 * the choice still works until the page is closed.
 *
 * Both are read with useSyncExternalStore: the server and the very first browser render use the
 * defaults (English, light), then the page switches to the stored choice without a hydration error.
 */

export type Theme = "light" | "dark";

export const LANGUAGE_STORAGE_KEY = "procureflow.language";
export const THEME_STORAGE_KEY = "procureflow.theme";

const isTheme = (value: unknown): value is Theme => value === "light" || value === "dark";

const listeners = new Set<() => void>();
let memoryLanguage: Language | null = null;
let memoryTheme: Theme | null = null;

function readStorage(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStorage(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Storage is blocked or full. The choice is kept in memory for this visit only.
  }
}

function systemPrefersDark(): boolean {
  return typeof window !== "undefined" && typeof window.matchMedia === "function"
    ? window.matchMedia("(prefers-color-scheme: dark)").matches
    : false;
}

function emit(): void {
  for (const listener of [...listeners]) listener();
}

/**
 * Put the theme on <html> (the CSS reads data-theme). It is applied when the user changes it, or when
 * another tab or the system setting changes it. At page load /theme-init.js has already done it, so
 * nothing is applied from React's first render (that would briefly undo the saved choice).
 */
function applyTheme(theme: Theme): void {
  if (typeof document === "undefined") return;
  document.documentElement.setAttribute("data-theme", theme);
  document.documentElement.style.colorScheme = theme;
}

function subscribe(listener: () => void): () => void {
  const onExternalChange = () => {
    applyTheme(getTheme());
    listener();
  };
  listeners.add(listener);
  window.addEventListener("storage", onExternalChange); // another tab changed the choice
  const media = typeof window.matchMedia === "function" ? window.matchMedia("(prefers-color-scheme: dark)") : null;
  media?.addEventListener("change", onExternalChange);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onExternalChange);
    media?.removeEventListener("change", onExternalChange);
  };
}

function getLanguage(): Language {
  const stored = readStorage(LANGUAGE_STORAGE_KEY);
  if (isLanguage(stored)) return stored;
  return memoryLanguage ?? DEFAULT_LANGUAGE;
}

function getTheme(): Theme {
  const stored = readStorage(THEME_STORAGE_KEY);
  if (isTheme(stored)) return stored;
  return memoryTheme ?? (systemPrefersDark() ? "dark" : "light");
}

export function setLanguage(language: Language): void {
  memoryLanguage = language;
  writeStorage(LANGUAGE_STORAGE_KEY, language);
  emit();
}

export function setTheme(theme: Theme): void {
  memoryTheme = theme;
  writeStorage(THEME_STORAGE_KEY, theme);
  applyTheme(theme);
  emit();
}

export function useLanguage(): [Language, (language: Language) => void] {
  const language = useSyncExternalStore(subscribe, getLanguage, () => DEFAULT_LANGUAGE);
  return [language, setLanguage];
}

export function useTheme(): [Theme, (theme: Theme) => void] {
  const theme = useSyncExternalStore(subscribe, getTheme, () => "light" as const);
  return [theme, setTheme];
}

/** The current language and its dictionary. Works without any provider (defaults to English). */
export function useTranslation(): { language: Language; t: Dictionary } {
  const [language] = useLanguage();
  return { language, t: DICTIONARIES[language] };
}

/** For tests: forget the in-memory fallbacks and stored choices. */
export function resetPreferencesForTests(): void {
  memoryLanguage = null;
  memoryTheme = null;
  try {
    window.localStorage.removeItem(LANGUAGE_STORAGE_KEY);
    window.localStorage.removeItem(THEME_STORAGE_KEY);
  } catch {
    // nothing to clear
  }
  emit();
}
