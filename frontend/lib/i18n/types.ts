import type { ErrorCode, FieldName, ProblemType } from "../types";

/** Languages the interface is available in. English is the default. */
export const LANGUAGE_CODES = ["en", "de", "ru", "es"] as const;
export type Language = (typeof LANGUAGE_CODES)[number];
export const DEFAULT_LANGUAGE: Language = "en";

export const isLanguage = (value: unknown): value is Language =>
  typeof value === "string" && (LANGUAGE_CODES as readonly string[]).includes(value);

/** Display texts for validation errors, keyed by the contract's field and code (these never change). */
export type ValidationTexts = Record<"$" | FieldName, Partial<Record<ErrorCode, string>>>;

export interface ProblemText {
  title: string;
  detail: string;
}

interface FieldText {
  label: string;
}

interface SectionText {
  title: string;
  subtitle: string;
}

/**
 * Everything the interface says, in one language. Every language file must satisfy this type, so a
 * missing text is a compile error. The API payloads, error codes and field names are never translated.
 */
export interface Dictionary {
  /** The language's own name, shown in the language selector. */
  nativeName: string;
  site: {
    skipToContent: string;
    devBadge: string;
    footer: string;
    languageLabel: string;
    themeLabel: string;
  };
  page: {
    docTitle: string;
    heroTitle: string;
    introBefore: string;
    introStrong: string;
    introAfter: string;
    chips: readonly [string, string, string];
    aboutTitle: string;
    about: readonly [string, string, string, string, string];
  };
  form: {
    ariaLabel: string;
    allRequired: string;
    save: string;
    saving: string;
    retry: string;
    savesOnly: string;
  };
  sections: { need: SectionText; cost: SectionText; who: SectionText };
  fields: {
    description: FieldText & { hint: (min: number, max: number) => string };
    quantity: FieldText & { hint: (min: number, max: number) => string };
    unit_price: FieldText & { hint: string };
    currency: FieldText & { hint: string };
    requester_display_name: FieldText & { hint: string };
  };
  /** Hidden prefix read by screen readers before each error message. */
  errorPrefix: string;
  validation: ValidationTexts;
  unknownField: string;
  announce: {
    sending: string;
    saved: string;
    clientErrors: (count: number) => string;
    serverErrors: (count: number) => string;
  };
  alerts: {
    timeout: ProblemText;
    network: ProblemText;
    unexpected: ProblemText;
    problems: Record<ProblemType, ProblemText>;
  };
  success: {
    title: string;
    lead: string;
    noteStrong: string;
    noteBody: string;
    /** Shown instead of the three entries for the in-memory case when the server says storage_mode "postgres". */
    postgresNoteStrong: string;
    postgresNoteBody: string;
    postgresStorageValue: string;
    id: string;
    status: string;
    statusValue: string;
    created: string;
    storage: string;
    storageValue: string;
    description: string;
    quantity: string;
    unitPrice: string;
    requester: string;
    total: string;
    totalNote: string;
    another: string;
  };
  notFound: { title: string; body: string; link: string };
}
