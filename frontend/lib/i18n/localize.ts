import type { FieldError, Problem } from "../types";
import type { Dictionary, Language, ProblemText } from "./types";

/**
 * Turn the API's stable codes into text for the chosen language.
 *
 * The API payloads and codes are never changed. Only the words shown to the user are looked up:
 * - English shows the server's own text unchanged (it is the source of truth in the contract).
 * - Other languages look the text up by the stable code (field + code, or problem type).
 *   If a code is unknown to the dictionary, the server's English text is shown instead.
 */
export function localizeError(language: Language, dictionary: Dictionary, error: FieldError): string {
  if (language === "en") return error.message;
  if (error.code === "unknown_field") return dictionary.unknownField;
  const field = error.field in dictionary.validation ? (error.field as keyof Dictionary["validation"]) : undefined;
  return (field && dictionary.validation[field][error.code]) || error.message;
}

export function localizeProblem(language: Language, dictionary: Dictionary, problem: Problem): ProblemText {
  if (language === "en") return { title: problem.title, detail: problem.detail };
  return dictionary.alerts.problems[problem.type] ?? { title: problem.title, detail: problem.detail };
}
