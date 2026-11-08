/**
 * Types for API contract purchase-request-v1 (FROZEN). Source of truth: contracts/purchase-request-v1/.
 * Do not add fields here that the contract does not have.
 */

export const CURRENCIES = ["EUR", "USD", "GBP", "CHF"] as const;
export type Currency = (typeof CURRENCIES)[number];

/** Request field names, in the order the contract reports errors. */
export const FIELD_NAMES = [
  "description",
  "quantity",
  "unit_price",
  "currency",
  "requester_display_name",
] as const;
export type FieldName = (typeof FIELD_NAMES)[number];

export const ERROR_CODES = [
  "required",
  "invalid_type",
  "too_short",
  "too_long",
  "out_of_range",
  "invalid_format",
  "invalid_choice",
  "unknown_field",
] as const;
export type ErrorCode = (typeof ERROR_CODES)[number];

export interface FieldError {
  /** A request field name, an unknown field name, or "$" when the whole body is wrong. */
  field: string;
  code: ErrorCode;
  message: string;
}

/** The validated body sent to POST /api/v1/requests. unit_price is a decimal STRING, never a float. */
export interface CreatePurchaseRequest {
  description: string;
  quantity: number;
  unit_price: string;
  currency: Currency;
  requester_display_name: string;
}

export type ValidationResult =
  | { ok: true; value: CreatePurchaseRequest }
  | { ok: false; errors: FieldError[] };

export const PROBLEM_TYPES = [
  "urn:procureflow:problem:invalid-json",
  "urn:procureflow:problem:payload-too-large",
  "urn:procureflow:problem:unsupported-media-type",
  "urn:procureflow:problem:validation-error",
  "urn:procureflow:problem:not-found",
  "urn:procureflow:problem:method-not-allowed",
  "urn:procureflow:problem:internal-error",
] as const;
export type ProblemType = (typeof PROBLEM_TYPES)[number];

export const PROBLEM_STATUSES = [400, 404, 405, 413, 415, 422, 500] as const;

/** RFC 9457 problem details, as defined by problem.schema.json. */
export interface Problem {
  type: ProblemType;
  title: string;
  status: number;
  detail: string;
  instance: string;
  errors?: FieldError[];
}

export interface MoneyAmount {
  /** Decimal string with exactly 2 decimal places, for example "2499.00". */
  amount: string;
  currency: Currency;
}

/** 201 response of POST /api/v1/requests. */
export interface PurchaseRequestDraft {
  id: string;
  status: "draft";
  created_at: string;
  storage_mode: "in_memory_dev";
  data: CreatePurchaseRequest;
  estimated_total: MoneyAmount;
}
