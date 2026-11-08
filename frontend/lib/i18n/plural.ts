/**
 * Pick the right word form for a number. Uses the browser's built-in Intl.PluralRules,
 * so no i18n library is needed. Russian needs "one / few / many", the others only "one / other".
 */
export interface PluralForms {
  one: string;
  few?: string;
  many?: string;
  other: string;
}

export function pluralWord(language: string, count: number, forms: PluralForms): string {
  const category = new Intl.PluralRules(language).select(count);
  if (category === "one" || category === "few" || category === "many") return forms[category] ?? forms.other;
  return forms.other;
}
