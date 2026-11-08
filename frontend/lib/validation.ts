import { FIELD_MESSAGES, UNKNOWN_FIELD_MESSAGE } from "./messages";
import {
  CURRENCIES,
  FIELD_NAMES,
  type CreatePurchaseRequest,
  type Currency,
  type ErrorCode,
  type FieldError,
  type FieldName,
  type ValidationResult,
} from "./types";

/**
 * Client-side validation that mirrors contract purchase-request-v1, section 4.2.
 *
 * Rules (all from the contract):
 * - A missing key is "required". A null value is "invalid_type".
 * - Per field only the FIRST failing rule is reported: type, then format, then range or length.
 * - Length is measured AFTER trimming, in characters (code points), so a blank string is too short.
 * - Errors come in field order, followed by unknown fields in the order they appear.
 * - A body that is not an object gives one error: field "$", code "invalid_type".
 *
 * The server validates again. This function only gives the user fast feedback.
 * Money is never turned into a float: the price is checked as text and compared in whole cents.
 */

const PRICE_PATTERN = /^(0|[1-9][0-9]*)(\.[0-9]{1,2})?$/;
const MAX_UNIT_PRICE_CENTS = 1_000_000_000n; // 10000000.00
const QUANTITY_MIN = 1;
const QUANTITY_MAX = 100_000;

export const LIMITS = {
  description: { min: 3, max: 500 },
  requester_display_name: { min: 2, max: 80 },
  quantity: { min: QUANTITY_MIN, max: QUANTITY_MAX },
} as const;

function fail(field: string, code: ErrorCode): FieldError {
  const message =
    code === "unknown_field" ? UNKNOWN_FIELD_MESSAGE : (FIELD_MESSAGES[field]?.[code] ?? "Invalid value.");
  return { field, code, message };
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function codePointLength(text: string): number {
  return Array.from(text).length;
}

type Checked<T> = { value: T } | { error: FieldError };

function checkText(
  body: Record<string, unknown>,
  field: "description" | "requester_display_name",
): Checked<string> {
  if (!Object.hasOwn(body, field)) return { error: fail(field, "required") };
  const raw = body[field];
  if (typeof raw !== "string") return { error: fail(field, "invalid_type") };
  const trimmed = raw.trim();
  const length = codePointLength(trimmed);
  if (length < LIMITS[field].min) return { error: fail(field, "too_short") };
  if (length > LIMITS[field].max) return { error: fail(field, "too_long") };
  return { value: trimmed };
}

function checkQuantity(body: Record<string, unknown>): Checked<number> {
  if (!Object.hasOwn(body, "quantity")) return { error: fail("quantity", "required") };
  const raw = body.quantity;
  if (typeof raw !== "number" || !Number.isInteger(raw)) {
    return { error: fail("quantity", "invalid_type") };
  }
  if (raw < QUANTITY_MIN || raw > QUANTITY_MAX) return { error: fail("quantity", "out_of_range") };
  return { value: raw };
}

function priceToCents(price: string): bigint {
  const [whole, fraction = ""] = price.split(".");
  return BigInt(whole) * 100n + BigInt(fraction.padEnd(2, "0"));
}

function checkUnitPrice(body: Record<string, unknown>): Checked<string> {
  if (!Object.hasOwn(body, "unit_price")) return { error: fail("unit_price", "required") };
  const raw = body.unit_price;
  if (typeof raw !== "string") return { error: fail("unit_price", "invalid_type") };
  if (!PRICE_PATTERN.test(raw)) return { error: fail("unit_price", "invalid_format") };
  const cents = priceToCents(raw);
  if (cents <= 0n || cents > MAX_UNIT_PRICE_CENTS) return { error: fail("unit_price", "out_of_range") };
  return { value: raw };
}

function checkCurrency(body: Record<string, unknown>): Checked<Currency> {
  if (!Object.hasOwn(body, "currency")) return { error: fail("currency", "required") };
  const raw = body.currency;
  if (typeof raw !== "string") return { error: fail("currency", "invalid_type") };
  if (!(CURRENCIES as readonly string[]).includes(raw)) return { error: fail("currency", "invalid_choice") };
  return { value: raw as Currency };
}

/** Validate a candidate request body (any JSON value) against the contract. */
export function validateRequestBody(body: unknown): ValidationResult {
  if (!isPlainObject(body)) return { ok: false, errors: [fail("$", "invalid_type")] };

  const errors: FieldError[] = [];
  const description = checkText(body, "description");
  const quantity = checkQuantity(body);
  const unitPrice = checkUnitPrice(body);
  const currency = checkCurrency(body);
  const requester = checkText(body, "requester_display_name");

  for (const checked of [description, quantity, unitPrice, currency, requester]) {
    if ("error" in checked) errors.push(checked.error);
  }
  for (const key of Object.keys(body)) {
    if (!(FIELD_NAMES as readonly string[]).includes(key)) errors.push(fail(key, "unknown_field"));
  }

  if (
    errors.length > 0 ||
    "error" in description ||
    "error" in quantity ||
    "error" in unitPrice ||
    "error" in currency ||
    "error" in requester
  ) {
    return { ok: false, errors };
  }

  const value: CreatePurchaseRequest = {
    description: description.value,
    quantity: quantity.value,
    unit_price: unitPrice.value,
    currency: currency.value,
    requester_display_name: requester.value,
  };
  return { ok: true, value };
}

/** Errors for one field only (used when the user leaves a field). */
export function errorsForField(result: ValidationResult, field: FieldName): FieldError | undefined {
  if (result.ok) return undefined;
  return result.errors.find((error) => error.field === field);
}
