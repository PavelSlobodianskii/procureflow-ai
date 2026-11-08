import { pluralWord } from "./plural";
import type { Dictionary } from "./types";

/**
 * English. The validation and problem texts are identical to the frozen contract
 * (messages.json and the example problem files); tests keep them in sync.
 */
export const en: Dictionary = {
  nativeName: "English",
  site: {
    skipToContent: "Skip to main content",
    devBadge: "Development preview · Synthetic data only",
    footer: "Learning project. All names, items and amounts are made up.",
    languageLabel: "Language",
    themeLabel: "Dark mode",
  },
  page: {
    docTitle: "New purchase request",
    heroTitle: "New purchase request",
    introBefore: "Describe the item or service you need. This saves a ",
    introStrong: "draft",
    introAfter: " only.",
    chips: ["Draft only", "Synthetic data", "Total calculated by the server"],
    aboutTitle: "About this form",
    about: [
      "It creates a draft request and nothing more.",
      "After saving, nothing is sent to anyone.",
      "Use made-up names and items only. This is a learning project.",
      "Drafts are kept for this demo only. In temporary development storage they are lost when the server restarts.",
      "The estimated total is calculated by the server, not in your browser.",
    ],
  },
  form: {
    ariaLabel: "Purchase request form",
    allRequired: "All fields are required.",
    save: "Save draft",
    saving: "Saving draft…",
    retry: "Try again",
    savesOnly: "Saves a draft only. Nothing is sent anywhere.",
  },
  sections: {
    need: { title: "What do you need?", subtitle: "Describe the item or service." },
    cost: { title: "Cost estimate", subtitle: "A rough estimate is enough." },
    who: { title: "Who is asking?", subtitle: "A made-up name for this demo." },
  },
  fields: {
    description: {
      label: "Description",
      hint: (min, max) => `Item or service you need, ${min} to ${max} characters.`,
    },
    quantity: { label: "Quantity", hint: (min, max) => `Whole number, ${min} to ${max}.` },
    unit_price: { label: "Estimated unit price", hint: "Use a dot, for example 249.90." },
    currency: { label: "Currency", hint: "Amounts are not converted." },
    requester_display_name: {
      label: "Requester display name",
      hint: "A made-up name only. Do not enter real personal data.",
    },
  },
  errorPrefix: "Error: ",
  validation: {
    $: { invalid_type: "Request body must be a JSON object." },
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
  },
  unknownField: "Unknown field. This field is not allowed.",
  announce: {
    sending: "Sending your request. Please wait.",
    saved: "Draft saved.",
    clientErrors: (count) =>
      `The form has ${count} ${pluralWord("en", count, { one: "error", other: "errors" })}. Please correct them and try again.`,
    serverErrors: (count) =>
      `The server rejected ${count} ${pluralWord("en", count, { one: "field", other: "fields" })}. Please correct them.`,
  },
  alerts: {
    timeout: {
      title: "The server did not respond",
      detail:
        "Waiting for an answer took too long. Your draft may or may not have been saved. Your entries are still here. Please try again.",
    },
    network: {
      title: "The server could not be reached",
      detail:
        "Check that the development server is running. Your draft may or may not have been saved. Your entries are still here. Please try again.",
    },
    unexpected: {
      title: "Unexpected response",
      detail:
        "The server sent an answer this form does not understand. Your draft may or may not have been saved. Your entries are still here. Please try again.",
    },
    problems: {
      "urn:procureflow:problem:invalid-json": {
        title: "Invalid JSON",
        detail: "The request body is not valid JSON.",
      },
      "urn:procureflow:problem:payload-too-large": {
        title: "Payload too large",
        detail: "The request body must not exceed 16384 bytes.",
      },
      "urn:procureflow:problem:unsupported-media-type": {
        title: "Unsupported media type",
        detail: "Content-Type must be application/json.",
      },
      "urn:procureflow:problem:validation-error": {
        title: "Validation failed",
        detail: "One or more fields are invalid.",
      },
      "urn:procureflow:problem:not-found": { title: "Not found", detail: "No such route." },
      "urn:procureflow:problem:method-not-allowed": {
        title: "Method not allowed",
        detail: "This route does not allow that HTTP method.",
      },
      "urn:procureflow:problem:internal-error": {
        title: "Internal error",
        detail: "An unexpected error occurred.",
      },
    },
  },
  success: {
    title: "Draft saved",
    lead: "Your request was saved as a draft.",
    noteStrong: "Temporary development storage.",
    noteBody:
      "This draft is kept only in the memory of the development server. It is lost when the server restarts. It has not been sent to anyone.",
    id: "Request ID",
    status: "Status",
    statusValue: "Draft",
    created: "Created",
    storage: "Storage",
    storageValue: "Temporary development storage",
    postgresNoteStrong: "Saved in the demo database.",
    postgresNoteBody: "This is still only a draft. It has not been sent to anyone. Use made-up data only.",
    postgresStorageValue: "Demo database (PostgreSQL)",
    description: "Description",
    quantity: "Quantity",
    unitPrice: "Unit price",
    requester: "Requester",
    total: "Estimated total",
    totalNote: "Estimate only: quantity times unit price, calculated by the server.",
    another: "Create another request",
  },
  notFound: {
    title: "Page not found",
    body: "This page does not exist.",
    link: "Go to the form",
  },
};
