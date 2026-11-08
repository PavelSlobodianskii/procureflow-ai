// Mock of the purchase-request-v1 backend. SYNTHETIC DATA ONLY. Not the real backend.
//
// - Dependency-free: only Node's own modules. Binds to 127.0.0.1 only. Makes no outgoing calls.
// - Serves texts and examples from contracts/purchase-request-v1/ (read-only, loaded at start-up),
//   so the mock and the real API stay identical without copying text by hand.
// - Has its OWN validator, deliberately written separately from the frontend's lib/validation.ts.
//   Both are tested against the shared cases.json, so a bug in one cannot hide a bug in the other.
// - Money uses whole cents as BigInt. There is no floating-point arithmetic on money.
// - Storage: none. Drafts are not kept at all. The ID counter lives in memory and resets on restart.
//
// Run:   npm run mock        (default port 8001; override with MOCK_PORT)
// Magic values for requester_display_name (exact match after trimming):
//   "Simulate Server Error"  -> 500 problem
//   "Simulate Slow"          -> waits 12 s (MOCK_SLOW_MS), then the normal 201
//   "Simulate Bad Request"   -> 400 problem
//   "Simulate Too Large"     -> 413 problem

import { readFileSync } from "node:fs";
import { createServer } from "node:http";
import { pathToFileURL } from "node:url";

const CONTRACT_DIR = new URL("../../contracts/purchase-request-v1/", import.meta.url);
const MAX_BODY_BYTES = 16384;
const DEFAULT_PORT = 8001;
const DEFAULT_SLOW_MS = 12000;
const HOST = "127.0.0.1";

const FIELDS = ["description", "quantity", "unit_price", "currency", "requester_display_name"];
const CURRENCIES = new Set(["EUR", "USD", "GBP", "CHF"]);
const PRICE_PATTERN = /^(0|[1-9][0-9]*)(\.[0-9]{1,2})?$/;
const TEXT_LIMITS = { description: [3, 500], requester_display_name: [2, 80] };
const MAX_UNIT_PRICE_CENTS = 1_000_000_000n; // 10000000.00

// ---------------------------------------------------------------------------------------------
// Contract files
// ---------------------------------------------------------------------------------------------

function readContract(relativePath) {
  return JSON.parse(readFileSync(new URL(relativePath, CONTRACT_DIR), "utf8"));
}

function loadContract() {
  return {
    messages: readContract("messages.json"),
    health: readContract("examples/health.200.json"),
    created: readContract("examples/create-response.201.json"),
    problems: {
      badRequest: readContract("examples/error.400.invalid-json.json"),
      notFound: readContract("examples/error.404.not-found.json"),
      methodNotAllowed: readContract("examples/error.405.method-not-allowed.json"),
      tooLarge: readContract("examples/error.413.payload-too-large.json"),
      unsupportedMediaType: readContract("examples/error.415.unsupported-media-type.json"),
      validation: readContract("examples/error.422.validation.json"),
      internal: readContract("examples/error.500.internal-error.json"),
    },
  };
}

// ---------------------------------------------------------------------------------------------
// Money, in whole cents
// ---------------------------------------------------------------------------------------------

function toCents(price) {
  const [whole, fraction = ""] = price.split(".");
  return BigInt(whole) * 100n + BigInt(fraction.padEnd(2, "0"));
}

function fromCents(cents) {
  return `${cents / 100n}.${(cents % 100n).toString().padStart(2, "0")}`;
}

// ---------------------------------------------------------------------------------------------
// Validation (contract section 4.2). First failing rule per field. Errors in field order,
// then unknown fields in the order they appear.
// ---------------------------------------------------------------------------------------------

function textRule(field) {
  const [min, max] = TEXT_LIMITS[field];
  return (value) => {
    if (typeof value !== "string") return { code: "invalid_type" };
    const trimmed = value.trim();
    const length = Array.from(trimmed).length;
    if (length < min) return { code: "too_short" };
    if (length > max) return { code: "too_long" };
    return { value: trimmed };
  };
}

const RULES = {
  description: textRule("description"),
  quantity(value) {
    if (typeof value !== "number" || !Number.isInteger(value)) return { code: "invalid_type" };
    if (value < 1 || value > 100000) return { code: "out_of_range" };
    return { value };
  },
  unit_price(value) {
    if (typeof value !== "string") return { code: "invalid_type" };
    if (!PRICE_PATTERN.test(value)) return { code: "invalid_format" };
    const cents = toCents(value);
    if (cents <= 0n || cents > MAX_UNIT_PRICE_CENTS) return { code: "out_of_range" };
    return { value: fromCents(cents) }; // normalised to exactly 2 decimals
  },
  currency(value) {
    if (typeof value !== "string") return { code: "invalid_type" };
    if (!CURRENCIES.has(value)) return { code: "invalid_choice" };
    return { value };
  },
  requester_display_name: textRule("requester_display_name"),
};

function validate(body, messages) {
  const error = (field, code) => ({
    field,
    code,
    message: code === "unknown_field" ? messages.unknown_field_message : messages.fields[field][code],
  });

  if (body === null || typeof body !== "object" || Array.isArray(body)) {
    return { errors: [error("$", "invalid_type")] };
  }

  const errors = [];
  const clean = {};
  for (const field of FIELDS) {
    if (!Object.prototype.hasOwnProperty.call(body, field)) {
      errors.push(error(field, "required"));
      continue;
    }
    const outcome = RULES[field](body[field]);
    if (outcome.code) errors.push(error(field, outcome.code));
    else clean[field] = outcome.value;
  }
  for (const key of Object.keys(body)) {
    if (!FIELDS.includes(key)) errors.push(error(key, "unknown_field"));
  }
  return errors.length > 0 ? { errors } : { clean };
}

// ---------------------------------------------------------------------------------------------
// The server
// ---------------------------------------------------------------------------------------------

/**
 * @param {{ slowMs?: number, log?: (line: string) => void }} [options]
 * @returns {import("node:http").Server}
 */
export function createMockServer({ slowMs = DEFAULT_SLOW_MS, log = () => {} } = {}) {
  const contract = loadContract();
  let counter = 0;

  function send(res, status, payload, { problem = false, headers = {} } = {}) {
    const text = JSON.stringify(payload);
    res.writeHead(status, {
      "Content-Type": problem ? "application/problem+json" : "application/json",
      "Content-Length": Buffer.byteLength(text),
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      ...headers,
    });
    res.end(text);
  }

  const sendProblem = (res, example, instance, headers) =>
    send(res, example.status, { ...example, instance }, { problem: true, headers });

  function createDraft(clean) {
    counter += 1;
    const year = new Date().getUTCFullYear();
    const totalCents = BigInt(clean.quantity) * toCents(clean.unit_price);
    return {
      id: `PR-${year}-${String(counter).padStart(6, "0")}`,
      status: "draft",
      created_at: new Date().toISOString().replace(/\.[0-9]{3}Z$/, "Z"),
      storage_mode: "in_memory_dev",
      data: {
        description: clean.description,
        quantity: clean.quantity,
        unit_price: clean.unit_price,
        currency: clean.currency,
        requester_display_name: clean.requester_display_name,
      },
      estimated_total: { amount: fromCents(totalCents), currency: clean.currency },
    };
  }

  function wait(res, ms) {
    return new Promise((resolve) => {
      const timer = setTimeout(resolve, ms);
      res.on("close", () => {
        clearTimeout(timer);
        resolve();
      });
    });
  }

  async function handleCreate(req, res, instance) {
    // Order of checks: content type (415), size (413), JSON parsing (400), validation (422).
    const mediaType = String(req.headers["content-type"] ?? "").split(";")[0].trim().toLowerCase();
    // On an early answer the rest of the body is read and thrown away (req.resume), and the connection
    // stays open. Closing it while the browser is still sending would reset the connection.
    if (mediaType !== "application/json") {
      req.resume();
      return sendProblem(res, contract.problems.unsupportedMediaType, instance);
    }

    const declaredLength = Number(req.headers["content-length"] ?? 0);
    if (declaredLength > MAX_BODY_BYTES) {
      req.resume();
      return sendProblem(res, contract.problems.tooLarge, instance);
    }

    const chunks = [];
    let received = 0;
    let tooLarge = false;
    await new Promise((resolve) => {
      req.on("data", (chunk) => {
        received += chunk.length;
        if (received > MAX_BODY_BYTES) tooLarge = true;
        else chunks.push(chunk);
      });
      req.on("end", resolve);
      req.on("error", resolve);
      req.on("close", resolve);
    });
    if (tooLarge) return sendProblem(res, contract.problems.tooLarge, instance);

    let body;
    try {
      const text = new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks));
      body = JSON.parse(text);
    } catch {
      return sendProblem(res, contract.problems.badRequest, instance);
    }

    const result = validate(body, contract.messages);
    if (result.errors) {
      return send(res, 422, { ...contract.problems.validation, instance, errors: result.errors }, { problem: true });
    }

    // Magic values (exact match, after validation succeeded).
    switch (result.clean.requester_display_name) {
      case "Simulate Server Error":
        return sendProblem(res, contract.problems.internal, instance);
      case "Simulate Bad Request":
        return sendProblem(res, contract.problems.badRequest, instance);
      case "Simulate Too Large":
        return sendProblem(res, contract.problems.tooLarge, instance);
      case "Simulate Slow":
        await wait(res, slowMs);
        if (res.destroyed) return undefined; // the browser gave up (its 10 s timeout)
        break;
      default:
        break;
    }

    return send(res, 201, createDraft(result.clean));
  }

  const server = createServer(async (req, res) => {
    const pathname = new URL(req.url ?? "/", `http://${HOST}`).pathname;
    res.on("finish", () => log(`${req.method} ${pathname.slice(0, 80)} -> ${res.statusCode}`));
    try {
      if (pathname === "/health") {
        if (req.method === "GET") return send(res, 200, contract.health);
        return sendProblem(res, contract.problems.methodNotAllowed, pathname, { Allow: "GET" });
      }
      if (pathname === "/api/v1/requests") {
        if (req.method === "POST") return await handleCreate(req, res, pathname);
        return sendProblem(res, contract.problems.methodNotAllowed, pathname, { Allow: "POST" });
      }
      return sendProblem(res, contract.problems.notFound, pathname.slice(0, 200));
    } catch {
      // Generic text only: never a stack trace, path or internal detail.
      if (!res.headersSent) sendProblem(res, contract.problems.internal, pathname.slice(0, 200));
      return undefined;
    }
  });

  return server;
}

// ---------------------------------------------------------------------------------------------
// Start-up when run as a script (npm run mock)
// ---------------------------------------------------------------------------------------------

const isMain = process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isMain) {
  const port = Number(process.env.MOCK_PORT ?? DEFAULT_PORT);
  const slowMs = Number(process.env.MOCK_SLOW_MS ?? DEFAULT_SLOW_MS);
  if (!Number.isInteger(port) || port < 1 || port > 65535 || !Number.isFinite(slowMs) || slowMs < 0) {
    console.error("MOCK_PORT must be a port number and MOCK_SLOW_MS a number of milliseconds.");
    process.exit(1);
  }
  const server = createMockServer({ slowMs, log: (line) => console.log(line) });
  server.listen(port, HOST, () => {
    console.log("MOCK API (synthetic data only). This is NOT the real backend. Nothing is stored.");
    console.log(`Listening on http://${HOST}:${port}   (GET /health, POST /api/v1/requests)`);
    console.log('Magic requester names: "Simulate Server Error", "Simulate Slow", "Simulate Bad Request", "Simulate Too Large"');
  });
}
