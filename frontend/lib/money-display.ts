import type { Language } from "./i18n/types";
import type { Currency } from "./types";

/**
 * Display helpers. They only change how server-provided text looks.
 * They never calculate money: amounts stay decimal strings and never pass through a floating-point number.
 */

const AMOUNT = /^(0|[1-9][0-9]*)(\.[0-9]{2})$/;

/** Thousands and decimal separators per language (the amount on the wire always uses a dot). */
const SEPARATORS: Record<Language, { group: string; decimal: string }> = {
  en: { group: ",", decimal: "." },
  de: { group: ".", decimal: "," },
  es: { group: ".", decimal: "," },
  ru: { group: " ", decimal: "," }, // no-break space
};

/** "2499.00" -> "2,499.00" (English), "2.499,00" (German). Anything that is not a plain 2-decimal amount is returned unchanged. */
export function formatAmount(amount: string, language: Language = "en"): string {
  const match = AMOUNT.exec(amount);
  if (!match) return amount;
  const { group, decimal } = SEPARATORS[language];
  const grouped = match[1].replace(/\B(?=([0-9]{3})+(?![0-9]))/g, group);
  return `${grouped}${decimal}${match[2].slice(1)}`;
}

/** "2026-11-08T10:15:30Z" -> "2026-11-08 10:15:30 UTC". Anything else is returned unchanged. */
export function formatTimestamp(isoUtc: string): string {
  const match = /^([0-9]{4}-[0-9]{2}-[0-9]{2})T([0-9]{2}:[0-9]{2}:[0-9]{2})Z$/.exec(isoUtc);
  return match ? `${match[1]} ${match[2]} UTC` : isoUtc;
}

/** A short symbol for the currency chip in the price field. */
export const CURRENCY_SYMBOLS: Record<Currency, string> = { EUR: "€", USD: "$", GBP: "£", CHF: "CHF" };
