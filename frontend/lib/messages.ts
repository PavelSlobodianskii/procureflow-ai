/**
 * Display texts for validation errors.
 *
 * This is a COPY of contracts/purchase-request-v1/messages.json. The frontend may not read files
 * outside frontend/, so the copy lives here. tests/validation.test.ts fails if the two ever differ,
 * so the texts cannot drift silently. Never edit these strings without a contract change by the lead.
 */
export const FIELD_MESSAGES: Record<string, Record<string, string>> = {
  $: {
    invalid_type: "Request body must be a JSON object.",
  },
  description: {
    required: "Description is required.",
    invalid_type: "Description must be text.",
    too_short: "Description must be at least 3 characters.",
    too_long: "Description must be at most 500 characters.",
  },
  quantity: {
    required: "Quantity is required.",
    invalid_type: "Quantity must be a whole number.",
    out_of_range: "Quantity must be between 1 and 100000.",
  },
  unit_price: {
    required: "Unit price is required.",
    invalid_type: 'Unit price must be text such as "249.90".',
    invalid_format:
      'Unit price must be a positive amount with at most 2 decimal places, for example "249.90".',
    out_of_range: "Unit price must be greater than 0 and at most 10000000.00.",
  },
  currency: {
    required: "Currency is required.",
    invalid_type: "Currency must be text.",
    invalid_choice: "Currency must be one of: EUR, USD, GBP, CHF.",
  },
  requester_display_name: {
    required: "Requester display name is required.",
    invalid_type: "Requester display name must be text.",
    too_short: "Requester display name must be at least 2 characters.",
    too_long: "Requester display name must be at most 80 characters.",
  },
};

export const UNKNOWN_FIELD_MESSAGE = "Unknown field. This field is not allowed.";
