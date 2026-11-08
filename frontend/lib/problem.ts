import {
  CURRENCIES,
  ERROR_CODES,
  PROBLEM_STATUSES,
  PROBLEM_TYPES,
  STORAGE_MODES,
  type FieldError,
  type Problem,
  type PurchaseRequestDraft,
} from "./types";

/**
 * Hand-written guards that mirror problem.schema.json and purchase-request-draft.response.schema.json.
 * Like the schemas, they allow NO extra properties: a response with an unexpected field (for example an
 * approval or purchase-order field) is treated as an unexpected response and is never shown.
 */

type Json = Record<string, unknown>;

function isObject(value: unknown): value is Json {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasExactKeys(value: Json, required: readonly string[], optional: readonly string[] = []): boolean {
  const keys = Object.keys(value);
  return required.every((key) => keys.includes(key)) && keys.every((key) => required.includes(key) || optional.includes(key));
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function lengthInRange(value: unknown, min: number, max: number): boolean {
  if (typeof value !== "string") return false;
  const length = Array.from(value).length;
  return length >= min && length <= max;
}

function isFieldError(value: unknown): value is FieldError {
  return (
    isObject(value) &&
    hasExactKeys(value, ["field", "code", "message"]) &&
    typeof value.field === "string" &&
    (ERROR_CODES as readonly unknown[]).includes(value.code) &&
    isNonEmptyString(value.message)
  );
}

export function isProblem(value: unknown): value is Problem {
  if (!isObject(value)) return false;
  if (!hasExactKeys(value, ["type", "title", "status", "detail", "instance"], ["errors"])) return false;
  if (!(PROBLEM_TYPES as readonly unknown[]).includes(value.type)) return false;
  if (!isNonEmptyString(value.title) || !isNonEmptyString(value.detail)) return false;
  if (typeof value.instance !== "string") return false;
  if (!(PROBLEM_STATUSES as readonly unknown[]).includes(value.status)) return false;
  if ("errors" in value) {
    if (!Array.isArray(value.errors) || value.errors.length < 1) return false;
    if (!value.errors.every(isFieldError)) return false;
  }
  return true;
}

const MONEY_AMOUNT = /^(0|[1-9][0-9]*)\.[0-9]{2}$/;
const DRAFT_ID = /^PR-[0-9]{4}-[0-9]{6}$/;
const CREATED_AT = /^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}Z$/;

function isCurrency(value: unknown): boolean {
  return (CURRENCIES as readonly unknown[]).includes(value);
}

function isMoneyAmount(value: unknown): boolean {
  return typeof value === "string" && MONEY_AMOUNT.test(value);
}

/** Exactly the values of contract v1 ("in_memory_dev") and v1.1 ("postgres"). Anything else is unexpected. */
function isStorageMode(value: unknown): boolean {
  return (STORAGE_MODES as readonly unknown[]).includes(value);
}

export function isDraft(value: unknown): value is PurchaseRequestDraft {
  if (!isObject(value)) return false;
  if (!hasExactKeys(value, ["id", "status", "created_at", "storage_mode", "data", "estimated_total"])) return false;
  if (typeof value.id !== "string" || !DRAFT_ID.test(value.id)) return false;
  if (value.status !== "draft") return false;
  if (typeof value.created_at !== "string" || !CREATED_AT.test(value.created_at)) return false;
  if (!isStorageMode(value.storage_mode)) return false;

  const { data, estimated_total: total } = value;
  if (!isObject(data)) return false;
  if (!hasExactKeys(data, ["description", "quantity", "unit_price", "currency", "requester_display_name"])) return false;
  if (!lengthInRange(data.description, 3, 500)) return false;
  if (typeof data.quantity !== "number" || !Number.isInteger(data.quantity)) return false;
  if (data.quantity < 1 || data.quantity > 100_000) return false;
  if (!isMoneyAmount(data.unit_price) || !isCurrency(data.currency)) return false;
  if (!lengthInRange(data.requester_display_name, 2, 80)) return false;

  if (!isObject(total)) return false;
  if (!hasExactKeys(total, ["amount", "currency"])) return false;
  return isMoneyAmount(total.amount) && isCurrency(total.currency);
}
