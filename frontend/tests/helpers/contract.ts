import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Read-only access to the frozen contract in contracts/purchase-request-v1/ (test code only).
 * The tests never write to it, and the app code never imports from it.
 * Tests run with frontend/ as the working directory (npm test), so the contract is one level up.
 *
 * The folder defaults to v1. Pass CONTRACT_V1_1 to read the additive revision in
 * contracts/purchase-request-v1.1/ (it adds only the storage_mode value "postgres").
 */

export const CONTRACT_V1 = "purchase-request-v1";
export const CONTRACT_V1_1 = "purchase-request-v1.1";

const CONTRACTS_ROOT = resolve(process.cwd(), "..", "contracts");

export function readContractJson<T = unknown>(relativePath: string, folder: string = CONTRACT_V1): T {
  const directory = resolve(CONTRACTS_ROOT, folder);
  if (!existsSync(directory)) {
    throw new Error("Contract folder not found. Run the tests from the frontend/ folder (npm test).");
  }
  return JSON.parse(readFileSync(resolve(directory, relativePath), "utf8")) as T;
}

export interface ExpectedError {
  field: string;
  code: string;
}

export interface AcceptedCase {
  name: string;
  override?: Record<string, unknown>;
  remove?: string[];
  body?: unknown;
  expect: Record<string, string>;
}

export interface RejectedCase {
  name: string;
  override?: Record<string, unknown>;
  remove?: string[];
  body?: unknown;
  expected_errors: ExpectedError[];
}

export interface CasesFile {
  accepted: AcceptedCase[];
  rejected: RejectedCase[];
}

export interface MessagesFile {
  fields: Record<string, Record<string, string>>;
  unknown_field_message: string;
}

export const validRequest = (): Record<string, unknown> =>
  readContractJson<Record<string, unknown>>("examples/create-request.valid.json");

export const cases = (): CasesFile => readContractJson<CasesFile>("examples/cases.json");

export const messages = (): MessagesFile => readContractJson<MessagesFile>("messages.json");

/** Build a case's request body exactly as cases.json "how_to_use" describes. */
export function buildCaseBody(testCase: {
  body?: unknown;
  override?: Record<string, unknown>;
  remove?: string[];
}): unknown {
  if ("body" in testCase) return testCase.body;
  const body = validRequest();
  for (const key of testCase.remove ?? []) delete body[key];
  Object.assign(body, testCase.override ?? {});
  return body;
}

/** The message the contract requires for a field and code. */
export function expectedMessage(field: string, code: string): string {
  const file = messages();
  if (code === "unknown_field") return file.unknown_field_message;
  return file.fields[field][code];
}
