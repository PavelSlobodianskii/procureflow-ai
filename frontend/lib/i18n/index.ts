import { de } from "./de";
import { en } from "./en";
import { es } from "./es";
import { ru } from "./ru";
import { LANGUAGE_CODES, type Dictionary, type Language } from "./types";

export { DEFAULT_LANGUAGE, LANGUAGE_CODES, isLanguage } from "./types";
export type { Dictionary, Language } from "./types";

/** Small local dictionaries. No i18n framework, no network requests. */
export const DICTIONARIES: Record<Language, Dictionary> = { en, de, ru, es };

/** For the language selector: each language shown in its own name. */
export const LANGUAGES: ReadonlyArray<{ code: Language; nativeName: string }> = LANGUAGE_CODES.map((code) => ({
  code,
  nativeName: DICTIONARIES[code].nativeName,
}));
