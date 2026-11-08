import { validateRequestBody } from "./validation";
import type { FieldName, ValidationResult } from "./types";

/** What the user typed, exactly as text. Every input in the form produces a string. */
export type FormValues = Record<FieldName, string>;

export const INITIAL_FORM_VALUES: FormValues = {
  description: "",
  quantity: "",
  unit_price: "",
  currency: "EUR",
  requester_display_name: "",
};

const WHOLE_NUMBER = /^-?[0-9]+$/;

/**
 * Turn typed text into a candidate JSON body for validateRequestBody.
 *
 * - A completely empty field becomes a missing key, so the user sees "... is required".
 * - Whitespace-only text stays as text, so the contract's "too short after trimming" rule applies.
 * - Quantity: whole-number text becomes a JSON integer. Anything else stays text and is reported
 *   as "must be a whole number". The price always stays text: money never becomes a float.
 */
export function buildCandidateBody(values: FormValues): Record<string, unknown> {
  const body: Record<string, unknown> = {};

  if (values.description !== "") body.description = values.description;

  const quantity = values.quantity.trim();
  if (quantity !== "") body.quantity = WHOLE_NUMBER.test(quantity) ? Number(quantity) : quantity;

  const price = values.unit_price.trim();
  if (price !== "") body.unit_price = price;

  if (values.currency !== "") body.currency = values.currency;

  if (values.requester_display_name !== "") body.requester_display_name = values.requester_display_name;

  return body;
}

export function validateForm(values: FormValues): ValidationResult {
  return validateRequestBody(buildCandidateBody(values));
}
