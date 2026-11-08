import { isDraft, isProblem } from "./problem";
import type { CreatePurchaseRequest, FieldError, Problem, PurchaseRequestDraft } from "./types";

/**
 * The one same-origin API client (architecture rule AD-4). The browser calls /api/v1/... on the
 * Next.js origin; a Next.js rewrite forwards it to the backend. No CORS, no Server Actions.
 *
 * Resilience limits from task 0001, section 3:
 * - 10 second timeout through AbortController.
 * - NO automatic retry. The POST has no idempotency key yet, so a retry could create a second draft.
 *   The user decides by clicking "Try again".
 */

export const CREATE_REQUEST_URL = "/api/v1/requests";
export const REQUEST_TIMEOUT_MS = 10_000;

export type CreateResult =
  /** 201: a draft was created. */
  | { kind: "created"; draft: PurchaseRequestDraft }
  /** 422: the server rejected fields. `errors` is the contract's list (field, code, message). */
  | { kind: "validation"; problem: Problem; errors: FieldError[] }
  /** 400, 404, 405, 413, 415, 422 without a list, 500: a valid problem document. */
  | { kind: "problem"; problem: Problem }
  /** No answer within 10 seconds. The draft may or may not have been saved. */
  | { kind: "timeout" }
  /** The browser could not reach the server at all. The draft may or may not have been saved. */
  | { kind: "network" }
  /** The answer was not a valid draft or problem. Its content is never shown. */
  | { kind: "unexpected"; httpStatus: number }
  /** The caller cancelled the call (for example the page was closed). Nothing to show. */
  | { kind: "aborted" };

export interface CreateOptions {
  /** Cancels the call from the outside. */
  signal?: AbortSignal;
  /** For tests only. Defaults to 10 seconds. */
  timeoutMs?: number;
}

function mediaType(response: Response): string {
  return (response.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
}

function parseJson(text: string): { ok: true; value: unknown } | { ok: false } {
  try {
    return { ok: true, value: JSON.parse(text) };
  } catch {
    return { ok: false };
  }
}

function interpret(response: Response, text: string): CreateResult {
  const unexpected: CreateResult = { kind: "unexpected", httpStatus: response.status };
  const type = mediaType(response);
  const parsed = parseJson(text);
  if (!parsed.ok) return unexpected;

  if (response.status === 201) {
    return type === "application/json" && isDraft(parsed.value)
      ? { kind: "created", draft: parsed.value }
      : unexpected;
  }

  if (type !== "application/problem+json" || !isProblem(parsed.value)) return unexpected;
  // The problem must describe the same HTTP status that came back.
  if (parsed.value.status !== response.status) return unexpected;

  const problem = parsed.value;
  if (response.status === 422 && problem.errors) {
    return { kind: "validation", problem, errors: problem.errors };
  }
  return { kind: "problem", problem };
}

export async function createPurchaseRequest(
  body: CreatePurchaseRequest,
  options: CreateOptions = {},
): Promise<CreateResult> {
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, options.timeoutMs ?? REQUEST_TIMEOUT_MS);

  const callerSignal = options.signal;
  const onCallerAbort = () => controller.abort();
  if (callerSignal) {
    if (callerSignal.aborted) controller.abort();
    else callerSignal.addEventListener("abort", onCallerAbort, { once: true });
  }

  try {
    // Exactly one attempt. There is deliberately no retry loop here.
    const response = await fetch(CREATE_REQUEST_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json, application/problem+json",
      },
      body: JSON.stringify(body),
      signal: controller.signal,
      cache: "no-store",
      credentials: "same-origin",
      redirect: "error",
    });
    // The timer keeps running while the body is read, so a stalled body also times out.
    const text = await response.text();
    return interpret(response, text);
  } catch {
    if (timedOut) return { kind: "timeout" };
    if (callerSignal?.aborted) return { kind: "aborted" };
    return { kind: "network" };
  } finally {
    clearTimeout(timer);
    callerSignal?.removeEventListener("abort", onCallerAbort);
  }
}
