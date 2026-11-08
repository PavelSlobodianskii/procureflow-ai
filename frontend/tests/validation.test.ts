import { describe, expect, it } from "vitest";
import { FIELD_MESSAGES, UNKNOWN_FIELD_MESSAGE } from "@/lib/messages";
import { buildCandidateBody, validateForm, type FormValues } from "@/lib/form";
import { validateRequestBody } from "@/lib/validation";
import {
  buildCaseBody,
  cases,
  expectedMessage,
  messages,
  validRequest,
} from "./helpers/contract";

describe("messages copy", () => {
  it("is identical to contracts/purchase-request-v1/messages.json (no drift)", () => {
    expect(FIELD_MESSAGES).toEqual(messages().fields);
    expect(UNKNOWN_FIELD_MESSAGE).toBe(messages().unknown_field_message);
  });
});

describe("shared cases: accepted (client side)", () => {
  for (const testCase of cases().accepted) {
    it(testCase.name, () => {
      const result = validateRequestBody(buildCaseBody(testCase));
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      // Only trimming is the client's job. Price normalisation and totals belong to the server.
      if (testCase.expect.description) expect(result.value.description).toBe(testCase.expect.description);
      if (testCase.expect.requester_display_name) {
        expect(result.value.requester_display_name).toBe(testCase.expect.requester_display_name);
      }
      if (testCase.expect.estimated_total_currency) {
        expect(result.value.currency).toBe(testCase.expect.estimated_total_currency);
      }
    });
  }
});

describe("shared cases: rejected (client side)", () => {
  for (const testCase of cases().rejected) {
    it(testCase.name, () => {
      const result = validateRequestBody(buildCaseBody(testCase));
      expect(result.ok).toBe(false);
      if (result.ok) return;
      // Same fields, same codes, same ORDER as the contract, with the contract's exact texts.
      expect(result.errors.map(({ field, code }) => ({ field, code }))).toEqual(testCase.expected_errors);
      for (const error of result.errors) {
        expect(error.message).toBe(expectedMessage(error.field, error.code));
      }
    });
  }
});

describe("boundaries generated in code", () => {
  const withOverride = (override: Record<string, unknown>) => validateRequestBody({ ...validRequest(), ...override });

  it("accepts a 500-character description and rejects 501", () => {
    expect(withOverride({ description: "x".repeat(500) }).ok).toBe(true);
    const result = withOverride({ description: "x".repeat(501) });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors).toEqual([expect.objectContaining({ field: "description", code: "too_long" })]);
  });

  it("accepts an 80-character display name and rejects 81", () => {
    expect(withOverride({ requester_display_name: "n".repeat(80) }).ok).toBe(true);
    const result = withOverride({ requester_display_name: "n".repeat(81) });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors).toEqual([expect.objectContaining({ field: "requester_display_name", code: "too_long" })]);
    }
  });

  it("measures length after trimming", () => {
    expect(withOverride({ description: ` ${"x".repeat(500)} ` }).ok).toBe(true);
    expect(withOverride({ description: `   ${"x".repeat(501)}   ` }).ok).toBe(false);
  });

  it("counts characters, not UTF-16 units (emoji count as one)", () => {
    expect(withOverride({ requester_display_name: "😀".repeat(80) }).ok).toBe(true);
    expect(withOverride({ requester_display_name: "😀".repeat(81) }).ok).toBe(false);
  });

  it("checks the quantity limits 1, 100000, 0 and 100001", () => {
    expect(withOverride({ quantity: 1 }).ok).toBe(true);
    expect(withOverride({ quantity: 100000 }).ok).toBe(true);
    expect(withOverride({ quantity: 0 }).ok).toBe(false);
    expect(withOverride({ quantity: 100001 }).ok).toBe(false);
  });

  it("checks the price limits exactly, without floating-point maths", () => {
    expect(withOverride({ unit_price: "0.01" }).ok).toBe(true);
    expect(withOverride({ unit_price: "10000000.00" }).ok).toBe(true);
    expect(withOverride({ unit_price: "10000000" }).ok).toBe(true);
    expect(withOverride({ unit_price: "10000000.01" }).ok).toBe(false);
    expect(withOverride({ unit_price: "0.00" }).ok).toBe(false);
    expect(withOverride({ unit_price: "0" }).ok).toBe(false);
  });
});

describe("form text -> candidate body", () => {
  const filled: FormValues = {
    description: "Synthetic chairs",
    quantity: "10",
    unit_price: "249.90",
    currency: "EUR",
    requester_display_name: "Alex Example",
  };

  it("turns whole-number text into a JSON integer and keeps the price as text", () => {
    const body = buildCandidateBody(filled);
    expect(body.quantity).toBe(10);
    expect(body.unit_price).toBe("249.90");
    expect(typeof body.unit_price).toBe("string");
  });

  it("accepts a fully filled form", () => {
    expect(validateForm(filled).ok).toBe(true);
  });

  it("reports every empty field as required, in field order", () => {
    const result = validateForm({ description: "", quantity: "", unit_price: "", currency: "", requester_display_name: "" });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.map((error) => [error.field, error.code])).toEqual([
        ["description", "required"],
        ["quantity", "required"],
        ["unit_price", "required"],
        ["currency", "required"],
        ["requester_display_name", "required"],
      ]);
    }
  });

  it.each([
    ["1.5", "invalid_type"],
    ["abc", "invalid_type"],
    ["1e2", "invalid_type"],
    ["+5", "invalid_type"],
    ["0", "out_of_range"],
    ["-3", "out_of_range"],
    ["100001", "out_of_range"],
    ["99999999999999999999", "out_of_range"],
  ])("quantity text %j -> %s", (quantity, code) => {
    const result = validateForm({ ...filled, quantity });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors).toEqual([expect.objectContaining({ field: "quantity", code })]);
  });

  it("trims quantity and price text before checking", () => {
    expect(validateForm({ ...filled, quantity: " 12 ", unit_price: " 12.50 " }).ok).toBe(true);
  });

  it("treats whitespace-only text as too short (not required)", () => {
    const result = validateForm({ ...filled, description: "     ", requester_display_name: "   " });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.map((error) => [error.field, error.code])).toEqual([
        ["description", "too_short"],
        ["requester_display_name", "too_short"],
      ]);
    }
  });

  it("rejects a comma decimal and an over-precise price", () => {
    for (const unit_price of ["1,50", "12.345"]) {
      const result = validateForm({ ...filled, unit_price });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.errors[0]).toMatchObject({ field: "unit_price", code: "invalid_format" });
    }
  });
});
