import { screen } from "@testing-library/react";
import type { UserEvent } from "@testing-library/user-event";
import { vi } from "vitest";
import { readContractJson } from "./contract";

export const LABELS = {
  description: "Description",
  quantity: "Quantity",
  unitPrice: "Estimated unit price",
  currency: "Currency",
  requester: "Requester display name",
} as const;

export const field = (name: keyof typeof LABELS) => screen.getByLabelText(LABELS[name]);

export const submitButton = () => screen.getByRole("button", { name: /^(save draft|try again|saving draft)/i });

export interface FillValues {
  description?: string;
  quantity?: string;
  unitPrice?: string;
  requester?: string;
}

/** Type valid synthetic values into the form. */
export async function fillValid(user: UserEvent, values: FillValues = {}) {
  await user.type(field("description"), values.description ?? "Synthetic chairs");
  await user.type(field("quantity"), values.quantity ?? "10");
  await user.type(field("unitPrice"), values.unitPrice ?? "249.90");
  await user.type(field("requester"), values.requester ?? "Alex Example");
}

export function respond(payload: unknown, status: number, contentType = "application/json"): Response {
  return new Response(typeof payload === "string" ? payload : JSON.stringify(payload), {
    status,
    headers: { "Content-Type": contentType },
  });
}

export const created = () => respond(readContractJson("examples/create-response.201.json"), 201);

export const problem = (example: string, status: number) =>
  respond(readContractJson(`examples/${example}`), status, "application/problem+json");

/** Replace the global fetch for one test. The real network is never used. */
export function stubFetch(impl: (url: string, init: RequestInit) => Promise<Response>) {
  const mock = vi.fn(impl);
  vi.stubGlobal("fetch", mock);
  return mock;
}

/** A fetch that never answers until the test resolves it. */
export function pendingFetch() {
  let resolve!: (response: Response) => void;
  const promise = new Promise<Response>((done) => {
    resolve = done;
  });
  const mock = stubFetch(() => promise);
  return { mock, resolve };
}
