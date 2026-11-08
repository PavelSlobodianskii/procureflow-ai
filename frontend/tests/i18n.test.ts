import { describe, expect, it } from "vitest";
import { DEFAULT_LANGUAGE, DICTIONARIES, LANGUAGES, LANGUAGE_CODES, isLanguage, type Dictionary, type Language } from "@/lib/i18n";
import { localizeError, localizeProblem } from "@/lib/i18n/localize";
import { pluralWord } from "@/lib/i18n/plural";
import { formatAmount } from "@/lib/money-display";
import { PROBLEM_TYPES, type FieldError, type Problem } from "@/lib/types";
import { messages, readContractJson } from "./helpers/contract";

const OTHER_LANGUAGES = LANGUAGE_CODES.filter((code) => code !== "en");

/** Every text in a dictionary as a flat list, calling the function-valued entries with sample numbers. */
function flatten(value: unknown, path = ""): Array<[string, string]> {
  if (typeof value === "string") return [[path, value]];
  if (typeof value === "function") {
    const fn = value as (...args: number[]) => string;
    return [1, 2, 5, 21].map((n): [string, string] => [`${path}(${n})`, fn(n, n + 100)]);
  }
  if (Array.isArray(value)) return value.flatMap((item, index) => flatten(item, `${path}[${index}]`));
  if (value && typeof value === "object") {
    return Object.entries(value).flatMap(([key, item]) => flatten(item, path ? `${path}.${key}` : key));
  }
  return [];
}

/** The shape of a dictionary: every key, and whether it holds text or a function. */
function shape(value: unknown, path = ""): string[] {
  if (typeof value === "string") return [`${path}:text`];
  if (typeof value === "function") return [`${path}:fn`];
  if (Array.isArray(value)) return [`${path}:array(${value.length})`, ...value.flatMap((item, i) => shape(item, `${path}[${i}]`))];
  if (value && typeof value === "object") {
    return Object.entries(value).flatMap(([key, item]) => shape(item, path ? `${path}.${key}` : key));
  }
  return [];
}

const numbersIn = (text: string) => (text.match(/\d[\d.]*\d|\d/g) ?? []).map((n) => n.replace(/\.$/, "")).sort();

describe("languages", () => {
  it("offers English, German, Russian and Spanish, and English is the default", () => {
    expect(DEFAULT_LANGUAGE).toBe("en");
    expect(LANGUAGES.map((language) => language.code)).toEqual(["en", "de", "ru", "es"]);
    expect(LANGUAGES.map((language) => language.nativeName)).toEqual(["English", "Deutsch", "Русский", "Español"]);
  });

  it("recognises only the four language codes", () => {
    for (const code of ["en", "de", "ru", "es"]) expect(isLanguage(code)).toBe(true);
    for (const bad of ["fr", "EN", "", null, undefined, 5, "en-US"]) expect(isLanguage(bad)).toBe(false);
  });
});

describe.each(OTHER_LANGUAGES)("dictionary %s", (code) => {
  const dictionary: Dictionary = DICTIONARIES[code];

  it("has exactly the same keys and kinds of entries as English", () => {
    expect(shape(dictionary)).toEqual(shape(DICTIONARIES.en));
  });

  it("has no empty text", () => {
    for (const [path, text] of flatten(dictionary)) expect(text.trim(), path).not.toBe("");
  });

  it("covers every validation field and code of the frozen contract", () => {
    for (const [field, codes] of Object.entries(messages().fields)) {
      for (const errorCode of Object.keys(codes)) {
        const text = (dictionary.validation as Record<string, Record<string, string>>)[field]?.[errorCode];
        expect(text, `${field}.${errorCode}`).toBeTruthy();
      }
    }
    expect(dictionary.unknownField).toBeTruthy();
  });

  it("covers every problem type of the contract", () => {
    for (const type of PROBLEM_TYPES) {
      expect(dictionary.alerts.problems[type].title, type).toBeTruthy();
      expect(dictionary.alerts.problems[type].detail, type).toBeTruthy();
    }
  });

  it("keeps every number from the English validation texts (limits, example price)", () => {
    const english = DICTIONARIES.en;
    for (const [field, codes] of Object.entries(english.validation)) {
      for (const [errorCode, text] of Object.entries(codes)) {
        const translated = (dictionary.validation as Record<string, Record<string, string>>)[field][errorCode];
        expect(numbersIn(translated), `${field}.${errorCode}`).toEqual(numbersIn(text as string));
      }
    }
    for (const type of PROBLEM_TYPES) {
      expect(numbersIn(dictionary.alerts.problems[type].detail), type).toEqual(
        numbersIn(DICTIONARIES.en.alerts.problems[type].detail),
      );
    }
  });

  it("keeps the example price and the limits in the hints", () => {
    expect(dictionary.fields.unit_price.hint).toContain("249.90");
    expect(dictionary.fields.description.hint(3, 500)).toContain("3");
    expect(dictionary.fields.description.hint(3, 500)).toContain("500");
    expect(dictionary.fields.quantity.hint(1, 100000)).toContain("100000");
  });

  it("keeps the technical names that must not be translated (EUR, USD, GBP, CHF, application/json)", () => {
    expect(dictionary.validation.currency.invalid_choice).toContain("EUR, USD, GBP, CHF");
    expect(dictionary.alerts.problems["urn:procureflow:problem:unsupported-media-type"].detail).toContain("application/json");
  });
});

describe("English dictionary equals the frozen contract", () => {
  it("validation texts are identical to messages.json", () => {
    expect(DICTIONARIES.en.validation).toEqual(messages().fields);
    expect(DICTIONARIES.en.unknownField).toBe(messages().unknown_field_message);
  });

  it.each([
    ["error.400.invalid-json.json", "urn:procureflow:problem:invalid-json"],
    ["error.404.not-found.json", "urn:procureflow:problem:not-found"],
    ["error.405.method-not-allowed.json", "urn:procureflow:problem:method-not-allowed"],
    ["error.413.payload-too-large.json", "urn:procureflow:problem:payload-too-large"],
    ["error.415.unsupported-media-type.json", "urn:procureflow:problem:unsupported-media-type"],
    ["error.422.validation.json", "urn:procureflow:problem:validation-error"],
    ["error.500.internal-error.json", "urn:procureflow:problem:internal-error"],
  ] as const)("%s title and detail match", (file, type) => {
    const example = readContractJson<Problem>(`examples/${file}`);
    expect(DICTIONARIES.en.alerts.problems[type]).toEqual({ title: example.title, detail: example.detail });
  });
});

describe("draft-only wording in every language (no approval, order, supplier or payment language)", () => {
  const FORBIDDEN: Record<Language, RegExp> = {
    en: /approv|\border(s|ed|ing)?\b|purchase order|\bPO\b|release|supplier|vendor|\bERP\b|\bpay(ment|ments|ing|s)?\b|\bsubmitted\b|\bconfirm/i,
    de: /genehmig|bestell|lieferant|freigabe|freigeb|zahlung|bezahl|bestätig|\bERP\b/i,
    es: /aprob|pedido|orden de compra|proveedor|\bpago|pagar|confirm|\bERP\b/i,
    ru: /утвержд|согласова|заказ|поставщик|оплат|платёж|платеж|подтверд|\bERP\b/i,
  };

  it.each(LANGUAGE_CODES)("%s", (code) => {
    for (const [path, text] of flatten(DICTIONARIES[code])) expect(text, path).not.toMatch(FORBIDDEN[code]);
  });
});

describe("PostgreSQL draft wording (contract v1.1) in every language", () => {
  it.each(LANGUAGE_CODES)("%s has its own text and does not claim the storage is temporary", (code) => {
    const s = DICTIONARIES[code].success;
    for (const text of [s.postgresNoteStrong, s.postgresNoteBody, s.postgresStorageValue]) {
      expect(text.trim()).not.toBe("");
    }
    expect(s.postgresNoteStrong).not.toBe(s.noteStrong);
    expect(s.postgresNoteBody).not.toBe(s.noteBody);
    expect(s.postgresStorageValue).not.toBe(s.storageValue);
    expect(s.postgresStorageValue).toContain("PostgreSQL"); // the technical name is never translated
  });

  it("English: says it is only a draft, was sent to no one, and promises nothing about being lost", () => {
    const s = DICTIONARIES.en.success;
    expect(s.postgresNoteBody).toMatch(/only a draft/i);
    expect(s.postgresNoteBody).toMatch(/not been sent to anyone/i);
    expect(`${s.postgresNoteStrong} ${s.postgresNoteBody}`).not.toMatch(/temporary|lost|restart|memory/i);
  });

  it("the in-memory wording still warns that the draft is lost on restart, in every language", () => {
    expect(DICTIONARIES.en.success.noteBody).toMatch(/lost when the server restarts/i);
    expect(DICTIONARIES.de.success.noteBody).toMatch(/geht verloren/i);
    expect(DICTIONARIES.es.success.noteBody).toMatch(/se pierde/i);
    expect(DICTIONARIES.ru.success.noteBody).toMatch(/потерян/i);
  });
});

describe("plural forms (built-in Intl.PluralRules, no library)", () => {
  it("English: 1 error, 2 errors", () => {
    expect(DICTIONARIES.en.announce.clientErrors(1)).toContain("1 error.");
    expect(DICTIONARIES.en.announce.clientErrors(2)).toContain("2 errors.");
  });

  it("Spanish: 1 campo, 3 campos", () => {
    expect(DICTIONARIES.es.announce.serverErrors(1)).toContain("1 campo.");
    expect(DICTIONARIES.es.announce.serverErrors(3)).toContain("3 campos.");
  });

  it("Russian uses one / few / many correctly", () => {
    const text = (n: number) => DICTIONARIES.ru.announce.clientErrors(n);
    expect(text(1)).toContain("1 ошибка");
    expect(text(2)).toContain("2 ошибки");
    expect(text(4)).toContain("4 ошибки");
    expect(text(5)).toContain("5 ошибок");
    expect(text(11)).toContain("11 ошибок");
    expect(text(21)).toContain("21 ошибка");
    const fields = (n: number) => DICTIONARIES.ru.announce.serverErrors(n);
    expect(fields(1)).toContain("1 поле");
    expect(fields(3)).toContain("3 поля");
    expect(fields(5)).toContain("5 полей");
  });

  it("pluralWord falls back to 'other'", () => {
    expect(pluralWord("en", 1.5, { one: "a", other: "b" })).toBe("b");
  });
});

describe("localizing API errors (codes and payloads stay untouched)", () => {
  const error = (field: string, code: FieldError["code"], message = "Server English text."): FieldError => ({ field, code, message });
  const problem: Problem = {
    type: "urn:procureflow:problem:internal-error",
    title: "Internal error",
    status: 500,
    detail: "An unexpected error occurred.",
    instance: "/api/v1/requests",
  };

  it("English shows the server's own text unchanged", () => {
    expect(localizeError("en", DICTIONARIES.en, error("description", "too_short", "Anything the server says."))).toBe(
      "Anything the server says.",
    );
    expect(localizeProblem("en", DICTIONARIES.en, { ...problem, title: "T", detail: "<b>D</b>" })).toEqual({ title: "T", detail: "<b>D</b>" });
  });

  it.each(OTHER_LANGUAGES)("%s looks the text up by field and code", (code) => {
    const dictionary = DICTIONARIES[code];
    expect(localizeError(code, dictionary, error("quantity", "out_of_range"))).toBe(dictionary.validation.quantity.out_of_range);
    expect(localizeError(code, dictionary, error("$", "invalid_type"))).toBe(dictionary.validation.$.invalid_type);
    expect(localizeError(code, dictionary, error("status", "unknown_field"))).toBe(dictionary.unknownField);
    expect(localizeProblem(code, dictionary, problem)).toEqual(
      dictionary.alerts.problems["urn:procureflow:problem:internal-error"],
    );
  });

  it("falls back to the server's text for a code the dictionary does not know", () => {
    expect(localizeError("de", DICTIONARIES.de, error("description", "invalid_choice", "Fallback."))).toBe("Fallback.");
    expect(localizeError("de", DICTIONARIES.de, error("mystery", "required", "Fallback 2."))).toBe("Fallback 2.");
  });
});

describe("amount formatting per language (strings only, no floats)", () => {
  it.each([
    ["en", "1,234,567.89"],
    ["de", "1.234.567,89"],
    ["es", "1.234.567,89"],
    ["ru", "1 234 567,89"],
  ] as const)("%s", (language, expected) => {
    expect(formatAmount("1234567.89", language)).toBe(expected);
  });

  it("handles small and the largest amounts, and leaves odd input alone", () => {
    expect(formatAmount("0.30", "de")).toBe("0,30");
    expect(formatAmount("1000000000000.00", "en")).toBe("1,000,000,000,000.00");
    expect(formatAmount("1000000000000.00", "de")).toBe("1.000.000.000.000,00");
    expect(formatAmount("12.5", "de")).toBe("12.5");
    expect(formatAmount("abc", "ru")).toBe("abc");
    expect(formatAmount("2499.00")).toBe("2,499.00"); // default language is English
  });
});
