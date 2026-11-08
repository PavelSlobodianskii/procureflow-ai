import { afterEach, describe, expect, it, vi } from "vitest";
import { createPurchaseRequest, CREATE_REQUEST_URL, REQUEST_TIMEOUT_MS } from "@/lib/api-client";
import type { CreatePurchaseRequest } from "@/lib/types";
import { CONTRACT_V1_1, readContractJson, validRequest } from "./helpers/contract";

const body = validRequest() as unknown as CreatePurchaseRequest;

function jsonResponse(payload: unknown, status: number, contentType = "application/json"): Response {
  return new Response(typeof payload === "string" ? payload : JSON.stringify(payload), {
    status,
    headers: { "Content-Type": contentType },
  });
}

function problemResponse(example: string, status: number): Response {
  return jsonResponse(readContractJson(`examples/${example}`), status, "application/problem+json");
}

function stubFetch(impl: (url: string, init: RequestInit) => Promise<Response>) {
  const fetchMock = vi.fn(impl);
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.useRealTimers();
});

describe("createPurchaseRequest: request shape", () => {
  it("sends one same-origin JSON POST with a signal and no caching, and never retries", async () => {
    const fetchMock = stubFetch(async () => jsonResponse(readContractJson("examples/create-response.201.json"), 201));
    await createPurchaseRequest(body);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/v1/requests");
    expect(url).toBe(CREATE_REQUEST_URL);
    expect(init.method).toBe("POST");
    expect(init.headers).toMatchObject({ "Content-Type": "application/json" });
    expect(JSON.parse(init.body as string)).toEqual(body);
    expect(init.signal).toBeInstanceOf(AbortSignal);
    expect(init.cache).toBe("no-store");
    expect(init.credentials).toBe("same-origin");
  });

  it("keeps the price as a string on the wire", async () => {
    const fetchMock = stubFetch(async () => jsonResponse(readContractJson("examples/create-response.201.json"), 201));
    await createPurchaseRequest(body);
    const sent = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(typeof sent.unit_price).toBe("string");
    expect(typeof sent.quantity).toBe("number");
  });
});

describe("createPurchaseRequest: results", () => {
  it("201 with a valid draft -> created", async () => {
    stubFetch(async () => jsonResponse(readContractJson("examples/create-response.201.json"), 201));
    const result = await createPurchaseRequest(body);
    expect(result.kind).toBe("created");
    if (result.kind === "created") {
      expect(result.draft.id).toBe("PR-2026-000001");
      expect(result.draft.status).toBe("draft");
    }
  });

  it("201 from a v1.1 server (storage_mode postgres) -> created, and the value is kept", async () => {
    stubFetch(async () =>
      jsonResponse(readContractJson("examples/create-response.201.postgres.json", CONTRACT_V1_1), 201),
    );
    const result = await createPurchaseRequest(body);
    expect(result.kind).toBe("created");
    if (result.kind === "created") {
      expect(result.draft.storage_mode).toBe("postgres");
      expect(result.draft.status).toBe("draft");
    }
  });

  it("201 with a storage_mode that no contract version knows -> unexpected, nothing is shown", async () => {
    const payload = { ...readContractJson<Record<string, unknown>>("examples/create-response.201.json"), storage_mode: "sqlite" };
    stubFetch(async () => jsonResponse(payload, 201));
    expect(await createPurchaseRequest(body)).toEqual({ kind: "unexpected", httpStatus: 201 });
  });

  it("422 with errors -> validation, keeping the contract's order and texts", async () => {
    stubFetch(async () => problemResponse("error.422.validation.json", 422));
    const result = await createPurchaseRequest(body);
    expect(result.kind).toBe("validation");
    if (result.kind === "validation") {
      expect(result.errors.map((error) => error.field)).toEqual([
        "description",
        "quantity",
        "unit_price",
        "currency",
        "requester_display_name",
      ]);
      expect(result.errors[0].message).toBe("Description must be at least 3 characters.");
    }
  });

  it("422 body-is-not-an-object -> validation with field $", async () => {
    stubFetch(async () => problemResponse("error.422.not-an-object.json", 422));
    const result = await createPurchaseRequest(body);
    expect(result.kind).toBe("validation");
    if (result.kind === "validation") expect(result.errors).toEqual([expect.objectContaining({ field: "$" })]);
  });

  it.each([
    ["error.400.invalid-json.json", 400],
    ["error.413.payload-too-large.json", 413],
    ["error.415.unsupported-media-type.json", 415],
    ["error.500.internal-error.json", 500],
    ["error.404.not-found.json", 404],
    ["error.405.method-not-allowed.json", 405],
  ])("%s -> problem with title and detail", async (example, status) => {
    stubFetch(async () => problemResponse(example, status));
    const result = await createPurchaseRequest(body);
    expect(result.kind).toBe("problem");
    if (result.kind === "problem") {
      expect(result.problem.status).toBe(status);
      expect(result.problem.title.length).toBeGreaterThan(0);
      expect(result.problem.detail.length).toBeGreaterThan(0);
    }
  });
});

describe("createPurchaseRequest: unexpected responses are never trusted", () => {
  it("201 that is not JSON -> unexpected", async () => {
    stubFetch(async () => jsonResponse("<html>oops</html>", 201));
    expect((await createPurchaseRequest(body)).kind).toBe("unexpected");
  });

  it("201 with an extra approval field -> unexpected (contract forbids extra fields)", async () => {
    const draft = readContractJson<Record<string, unknown>>("examples/create-response.201.json");
    stubFetch(async () => jsonResponse({ ...draft, approved: true }, 201));
    expect((await createPurchaseRequest(body)).kind).toBe("unexpected");
  });

  it("201 whose status is not 'draft' -> unexpected", async () => {
    const draft = readContractJson<Record<string, unknown>>("examples/create-response.201.json");
    stubFetch(async () => jsonResponse({ ...draft, status: "approved" }, 201));
    expect((await createPurchaseRequest(body)).kind).toBe("unexpected");
  });

  it("201 with the wrong content type -> unexpected", async () => {
    stubFetch(async () => jsonResponse(readContractJson("examples/create-response.201.json"), 201, "text/html"));
    expect((await createPurchaseRequest(body)).kind).toBe("unexpected");
  });

  it("error with the wrong content type -> unexpected", async () => {
    stubFetch(async () => jsonResponse(readContractJson("examples/error.500.internal-error.json"), 500, "application/json"));
    expect((await createPurchaseRequest(body)).kind).toBe("unexpected");
  });

  it("problem whose status differs from the HTTP status -> unexpected", async () => {
    stubFetch(async () => problemResponse("error.500.internal-error.json", 400));
    expect((await createPurchaseRequest(body)).kind).toBe("unexpected");
  });

  it("problem with an unknown type -> unexpected", async () => {
    const problem = readContractJson<Record<string, unknown>>("examples/error.500.internal-error.json");
    stubFetch(async () => jsonResponse({ ...problem, type: "urn:example:other" }, 500, "application/problem+json"));
    expect((await createPurchaseRequest(body)).kind).toBe("unexpected");
  });

  it("plain-text error page (for example when the backend is down) -> unexpected", async () => {
    stubFetch(async () => new Response("Internal Server Error", { status: 500, headers: { "Content-Type": "text/plain" } }));
    const result = await createPurchaseRequest(body);
    expect(result).toEqual({ kind: "unexpected", httpStatus: 500 });
  });

  it("unexpected status such as 302 or 503 -> unexpected", async () => {
    stubFetch(async () => problemResponse("error.500.internal-error.json", 503));
    expect((await createPurchaseRequest(body)).kind).toBe("unexpected");
  });
});

describe("createPurchaseRequest: timeout and network failure", () => {
  it("gives up after 10 seconds with kind 'timeout' and aborts the request", async () => {
    vi.useFakeTimers();
    let signal: AbortSignal | undefined;
    const fetchMock = stubFetch(
      (_url, init) =>
        new Promise((_resolve, reject) => {
          signal = init.signal as AbortSignal;
          signal.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
        }),
    );

    const pending = createPurchaseRequest(body);
    await vi.advanceTimersByTimeAsync(REQUEST_TIMEOUT_MS - 1);
    expect(signal?.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(1);

    await expect(pending).resolves.toEqual({ kind: "timeout" });
    expect(signal?.aborted).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1); // no retry after the timeout
  });

  it("uses a 10 second default", () => {
    expect(REQUEST_TIMEOUT_MS).toBe(10_000);
  });

  it("a network failure (fetch rejects) -> 'network'", async () => {
    const fetchMock = stubFetch(async () => {
      throw new TypeError("Failed to fetch");
    });
    await expect(createPurchaseRequest(body)).resolves.toEqual({ kind: "network" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("a caller cancelling the call -> 'aborted'", async () => {
    stubFetch(
      (_url, init) =>
        new Promise((_resolve, reject) => {
          (init.signal as AbortSignal).addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
        }),
    );
    const controller = new AbortController();
    const pending = createPurchaseRequest(body, { signal: controller.signal });
    controller.abort();
    await expect(pending).resolves.toEqual({ kind: "aborted" });
  });
});
