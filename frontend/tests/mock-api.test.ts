import { request as httpRequest, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createMockServer } from "../mock-api/server.mjs";
import { isDraft, isProblem } from "@/lib/problem";
import { buildCaseBody, cases, expectedMessage, readContractJson, validRequest } from "./helpers/contract";

// Real HTTP against the mock on a random local port. The real backend is never contacted.

let server: Server;
let base: string;

async function start(slowMs: number): Promise<{ server: Server; base: string }> {
  const instance = createMockServer({ slowMs });
  await new Promise<void>((resolve) => instance.listen(0, "127.0.0.1", resolve));
  return { server: instance, base: `http://127.0.0.1:${(instance.address() as AddressInfo).port}` };
}

async function stop(instance: Server) {
  instance.closeAllConnections();
  await new Promise<void>((resolve) => instance.close(() => resolve()));
}

beforeAll(async () => {
  ({ server, base } = await start(150));
});

afterAll(async () => {
  await stop(server);
});

const post = (body: BodyInit, headers: Record<string, string> = { "Content-Type": "application/json" }) =>
  fetch(`${base}/api/v1/requests`, { method: "POST", headers, body });

const postJson = (value: unknown) => post(JSON.stringify(value));

const example = (name: string) => readContractJson<Record<string, unknown>>(`examples/${name}`);

describe("health", () => {
  it("GET /health returns the contract example", async () => {
    const response = await fetch(`${base}/health`);
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/json");
    expect(await response.json()).toEqual(example("health.200.json"));
  });

  it("POST /health is 405 with Allow: GET", async () => {
    const response = await fetch(`${base}/health`, { method: "POST" });
    expect(response.status).toBe(405);
    expect(response.headers.get("allow")).toBe("GET");
  });
});

describe("shared cases: accepted", () => {
  for (const testCase of cases().accepted) {
    it(testCase.name, async () => {
      const response = await postJson(buildCaseBody(testCase));
      expect(response.status).toBe(201);
      expect(response.headers.get("content-type")).toBe("application/json");
      expect(response.headers.get("cache-control")).toBe("no-store");
      const draft = await response.json();
      expect(isDraft(draft)).toBe(true);
      expect(draft.status).toBe("draft");
      expect(draft.storage_mode).toBe("in_memory_dev");

      const { expect: wanted } = testCase;
      if (wanted.description) expect(draft.data.description).toBe(wanted.description);
      if (wanted.requester_display_name) expect(draft.data.requester_display_name).toBe(wanted.requester_display_name);
      if (wanted.unit_price) expect(draft.data.unit_price).toBe(wanted.unit_price);
      if (wanted.estimated_total_amount) expect(draft.estimated_total.amount).toBe(wanted.estimated_total_amount);
      if (wanted.estimated_total_currency) expect(draft.estimated_total.currency).toBe(wanted.estimated_total_currency);
    });
  }
});

describe("shared cases: rejected", () => {
  for (const testCase of cases().rejected) {
    it(testCase.name, async () => {
      const response = await postJson(buildCaseBody(testCase));
      expect(response.status).toBe(422);
      expect(response.headers.get("content-type")).toBe("application/problem+json");
      expect(response.headers.get("cache-control")).toBe("no-store");
      const problem = await response.json();
      expect(isProblem(problem)).toBe(true);
      expect(problem.type).toBe("urn:procureflow:problem:validation-error");
      expect(problem.errors.map(({ field, code }: { field: string; code: string }) => ({ field, code }))).toEqual(
        testCase.expected_errors,
      );
      for (const error of problem.errors) expect(error.message).toBe(expectedMessage(error.field, error.code));
    });
  }

  it("the all-fields-invalid case is identical to the 422 example file", async () => {
    const testCase = cases().rejected.find((item) => item.name === "all-fields-invalid-matches-422-example");
    const response = await postJson(buildCaseBody(testCase!));
    expect(await response.json()).toEqual(example("error.422.validation.json"));
  });

  it("body that is not an object is identical to the not-an-object example file", async () => {
    const response = await postJson([]);
    expect(await response.json()).toEqual(example("error.422.not-an-object.json"));
  });
});

describe("boundaries generated in code", () => {
  it("accepts 500 and 80 characters, rejects 501 and 81", async () => {
    expect((await postJson({ ...validRequest(), description: "x".repeat(500) })).status).toBe(201);
    expect((await postJson({ ...validRequest(), description: "x".repeat(501) })).status).toBe(422);
    expect((await postJson({ ...validRequest(), requester_display_name: "n".repeat(80) })).status).toBe(201);
    expect((await postJson({ ...validRequest(), requester_display_name: "n".repeat(81) })).status).toBe(422);
  });
});

describe("money", () => {
  it("never uses floating-point maths (0.1 x 3 is exactly 0.30)", async () => {
    const draft = await (await postJson({ ...validRequest(), unit_price: "0.1", quantity: 3 })).json();
    expect(draft.data.unit_price).toBe("0.10");
    expect(draft.estimated_total.amount).toBe("0.30");
  });

  it("computes the largest possible total exactly", async () => {
    const draft = await (await postJson({ ...validRequest(), unit_price: "10000000.00", quantity: 100000 })).json();
    expect(draft.estimated_total.amount).toBe("1000000000000.00");
  });
});

describe("201 shape", () => {
  it("has exactly the contract's fields, an ID and a UTC timestamp, and counts upward", async () => {
    const first = await (await postJson(validRequest())).json();
    const second = await (await postJson(validRequest())).json();
    expect(Object.keys(first).sort()).toEqual(["created_at", "data", "estimated_total", "id", "status", "storage_mode"]);
    expect(first.id).toMatch(/^PR-[0-9]{4}-[0-9]{6}$/);
    expect(first.created_at).toMatch(/^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}Z$/);
    expect(Number(second.id.slice(-6))).toBe(Number(first.id.slice(-6)) + 1);
  });

  it("matches the 201 example for the example request", async () => {
    const draft = await (await postJson(validRequest())).json();
    const wanted = example("create-response.201.json");
    expect(draft.data).toEqual(wanted.data);
    expect(draft.estimated_total).toEqual(wanted.estimated_total);
  });
});

describe("errors and the order of checks", () => {
  const withInstance = (name: string, instance: string) => ({ ...example(name), instance });

  it("415 for a wrong content type, but 201 when a charset=utf-8 parameter is added", async () => {
    const wrong = await post(JSON.stringify(validRequest()), { "Content-Type": "text/plain" });
    expect(wrong.status).toBe(415);
    expect(wrong.headers.get("content-type")).toBe("application/problem+json");
    expect(await wrong.json()).toEqual(example("error.415.unsupported-media-type.json"));

    const charset = await post(JSON.stringify(validRequest()), { "Content-Type": "application/json; charset=utf-8" });
    expect(charset.status).toBe(201);
  });

  it("400 for invalid JSON, an empty body and bytes that are not UTF-8", async () => {
    for (const body of ["{not json", "", new Uint8Array([0x7b, 0xff, 0x7d])]) {
      const response = await post(body);
      expect(response.status).toBe(400);
      expect(await response.json()).toEqual(example("error.400.invalid-json.json"));
    }
  });

  it("413 above 16384 bytes, but a body of exactly 16384 bytes is still read", async () => {
    const padded = (size: number) => {
      const base = JSON.stringify({ ...validRequest(), description: "" });
      return JSON.stringify({ ...validRequest(), description: "x".repeat(size - base.length) });
    };
    const over = await post(padded(16385));
    expect(over.status).toBe(413);
    expect(await over.json()).toEqual(example("error.413.payload-too-large.json"));

    const exact = await post(padded(16384));
    expect(exact.status).toBe(422); // read and validated (description too long), not rejected for size
  });

  it("413 also when the size is only discovered while streaming (no Content-Length)", async () => {
    const address = new URL(base);
    const status = await new Promise<number>((resolve, reject) => {
      const req = httpRequest(
        { host: address.hostname, port: address.port, method: "POST", path: "/api/v1/requests", headers: { "Content-Type": "application/json" } },
        (res) => {
          res.resume();
          resolve(res.statusCode ?? 0);
        },
      );
      req.on("error", reject);
      req.write('{"description":"');
      req.write("x".repeat(20000));
      req.end('"}');
    });
    expect(status).toBe(413);
  });

  it("checks content type (415) before size (413), and size before JSON (400), and JSON before fields (422)", async () => {
    const big = "x".repeat(20000);
    expect((await post(big, { "Content-Type": "text/plain" })).status).toBe(415);
    expect((await post(big)).status).toBe(413);
    expect((await post("{not json")).status).toBe(400);
    expect((await postJson({})).status).toBe(422);
  });

  it("404 for any other route, with the path as instance", async () => {
    for (const path of ["/api/v1/unknown", "/api/v1/requests/PR-2026-000001", "/api/v1/requests/", "/", "/api/v2/requests"]) {
      const response = await fetch(`${base}${path}`);
      expect(response.status).toBe(404);
      expect(response.headers.get("content-type")).toBe("application/problem+json");
      expect(await response.json()).toEqual(withInstance("error.404.not-found.json", path));
    }
  });

  it("405 with Allow: POST for other methods on /api/v1/requests", async () => {
    for (const method of ["GET", "PUT", "PATCH", "DELETE"]) {
      const response = await fetch(`${base}/api/v1/requests`, { method });
      expect(response.status).toBe(405);
      expect(response.headers.get("allow")).toBe("POST");
      expect(await response.json()).toEqual(example("error.405.method-not-allowed.json"));
    }
  });

  it("listens on 127.0.0.1 only", () => {
    expect((server.address() as AddressInfo).address).toBe("127.0.0.1");
  });
});

describe("magic requester names", () => {
  const withName = (name: string) => postJson({ ...validRequest(), requester_display_name: name });

  it("Simulate Server Error -> 500 problem", async () => {
    const response = await withName("Simulate Server Error");
    expect(response.status).toBe(500);
    expect(response.headers.get("content-type")).toBe("application/problem+json");
    expect(await response.json()).toEqual(example("error.500.internal-error.json"));
  });

  it("Simulate Bad Request -> 400 problem", async () => {
    const response = await withName("Simulate Bad Request");
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual(example("error.400.invalid-json.json"));
  });

  it("Simulate Too Large -> 413 problem", async () => {
    const response = await withName("Simulate Too Large");
    expect(response.status).toBe(413);
    expect(await response.json()).toEqual(example("error.413.payload-too-large.json"));
  });

  it("matches after trimming, and only exactly", async () => {
    expect((await withName("  Simulate Server Error ")).status).toBe(500);
    expect((await withName("simulate server error")).status).toBe(201);
    expect((await withName("Simulate Server Errors")).status).toBe(201);
  });

  it("an invalid body is still a 422, even with a magic name", async () => {
    const response = await postJson({ ...validRequest(), quantity: 0, requester_display_name: "Simulate Server Error" });
    expect(response.status).toBe(422);
  });

  it("Simulate Slow waits, then answers with the normal 201 (this test uses a short delay)", async () => {
    const started = Date.now();
    const response = await withName("Simulate Slow");
    expect(Date.now() - started).toBeGreaterThanOrEqual(140);
    expect(response.status).toBe(201);
    expect(isDraft(await response.json())).toBe(true);
  });

  it("keeps working when the browser gives up on a slow request", async () => {
    const slow = await start(400);
    try {
      const controller = new AbortController();
      const pending = fetch(`${slow.base}/api/v1/requests`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...validRequest(), requester_display_name: "Simulate Slow" }),
        signal: controller.signal,
      });
      setTimeout(() => controller.abort(), 50);
      await expect(pending).rejects.toThrow();
      await new Promise((resolve) => setTimeout(resolve, 450));
      expect((await fetch(`${slow.base}/health`)).status).toBe(200);
    } finally {
      await stop(slow.server);
    }
  });
});
