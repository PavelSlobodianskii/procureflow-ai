import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { config, proxy } from "../proxy";

// Visibly fake, local-only values (Tier 1). They are not secrets.
const DEV_TOKEN = "dev-gateway-token-0123456789-abcdefghij";
const DEV_BYPASS = "dev-bypass-0123456789-abcdefghijklmno";
const GATEWAY_HEADER = "x-procureflow-gateway";
const BYPASS_HEADER = "x-vercel-protection-bypass";
const ROOT = process.cwd();

/**
 * Next.js describes "what is sent on to the backend" with two response headers:
 * "x-middleware-override-headers" lists the request header names, and each value travels as
 * "x-middleware-request-<name>". Next.js consumes them before anything reaches the browser.
 */
function forwarded(response: Response): Map<string, string> {
  const names = (response.headers.get("x-middleware-override-headers") ?? "").split(",").filter(Boolean);
  return new Map(names.map((name) => [name, response.headers.get(`x-middleware-request-${name}`) ?? ""]));
}

function run(headers: Record<string, string> = {}, path = "/api/v1/requests") {
  const request = new NextRequest(new URL(path, "http://127.0.0.1:3000"), { method: "POST", headers });
  return proxy(request);
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("proxy.ts: server-side credentials for the backend", () => {
  it("runs for /api/v1/* only", () => {
    expect(config).toEqual({ matcher: "/api/v1/:path*" });
  });

  it("adds nothing when no token is set (local development)", () => {
    vi.stubEnv("BACKEND_GATEWAY_TOKEN", "");
    vi.stubEnv("BACKEND_PROTECTION_BYPASS", "");
    const sent = forwarded(run({ "content-type": "application/json" }));
    expect(sent.has(GATEWAY_HEADER)).toBe(false);
    expect(sent.has(BYPASS_HEADER)).toBe(false);
    expect(sent.get("content-type")).toBe("application/json"); // other headers pass through
  });

  it("adds the gateway token when it is set", () => {
    vi.stubEnv("BACKEND_GATEWAY_TOKEN", DEV_TOKEN);
    vi.stubEnv("BACKEND_PROTECTION_BYPASS", "");
    const sent = forwarded(run());
    expect(sent.get(GATEWAY_HEADER)).toBe(DEV_TOKEN);
    expect(sent.has(BYPASS_HEADER)).toBe(false);
  });

  it("adds the protection bypass only when it is set", () => {
    vi.stubEnv("BACKEND_GATEWAY_TOKEN", DEV_TOKEN);
    vi.stubEnv("BACKEND_PROTECTION_BYPASS", DEV_BYPASS);
    const sent = forwarded(run());
    expect(sent.get(GATEWAY_HEADER)).toBe(DEV_TOKEN);
    expect(sent.get(BYPASS_HEADER)).toBe(DEV_BYPASS);
  });

  it("removes a value sent by the browser, with or without a token", () => {
    const fromBrowser = { [GATEWAY_HEADER]: "from-the-browser", [BYPASS_HEADER]: "from-the-browser" };

    vi.stubEnv("BACKEND_GATEWAY_TOKEN", "");
    vi.stubEnv("BACKEND_PROTECTION_BYPASS", "");
    let sent = forwarded(run(fromBrowser));
    expect(sent.has(GATEWAY_HEADER)).toBe(false);
    expect(sent.has(BYPASS_HEADER)).toBe(false);

    vi.stubEnv("BACKEND_GATEWAY_TOKEN", DEV_TOKEN);
    sent = forwarded(run(fromBrowser));
    expect(sent.get(GATEWAY_HEADER)).toBe(DEV_TOKEN);
    expect(sent.has(BYPASS_HEADER)).toBe(false);
  });

  it("continues the request: no redirect, no rewrite, no answer of its own", () => {
    vi.stubEnv("BACKEND_GATEWAY_TOKEN", DEV_TOKEN);
    const response = run();
    expect(response.headers.get("x-middleware-next")).toBe("1");
    expect(response.headers.get("x-middleware-rewrite")).toBeNull();
    expect(response.headers.get("location")).toBeNull();
  });

  it("never exposes a token to the browser", () => {
    vi.stubEnv("BACKEND_GATEWAY_TOKEN", DEV_TOKEN);
    vi.stubEnv("BACKEND_PROTECTION_BYPASS", DEV_BYPASS);
    const response = run();
    // The only response headers are Next.js's internal "x-middleware-*" ones, which it strips.
    const visible = [...response.headers.keys()].filter((name) => !name.startsWith("x-middleware-"));
    expect(visible).toEqual([]);
    expect(response.headers.get("set-cookie")).toBeNull();
  });
});

describe("the tokens stay on the server", () => {
  function files(directory: string): string[] {
    return (readdirSync(join(ROOT, directory), { recursive: true }) as string[])
      .map((entry) => join(ROOT, directory, entry))
      .filter((path) => statSync(path).isFile());
  }

  it("no NEXT_PUBLIC_ variable is used anywhere in the frontend source", () => {
    const sources = [...files("app"), ...files("lib"), join(ROOT, "proxy.ts"), join(ROOT, "next.config.ts")];
    for (const file of sources) {
      expect(readFileSync(file, "utf8"), file).not.toMatch(/NEXT_PUBLIC_/);
    }
  });

  it("only proxy.ts names the token variables, and browser code never reads the environment", () => {
    for (const file of [...files("app"), ...files("lib")]) {
      const text = readFileSync(file, "utf8");
      expect(text, file).not.toMatch(/BACKEND_GATEWAY_TOKEN|BACKEND_PROTECTION_BYPASS|x-procureflow-gateway/);
      expect(text, file).not.toMatch(/process\.env/);
    }
  });

  it("proxy.ts does not log", () => {
    expect(readFileSync(join(ROOT, "proxy.ts"), "utf8")).not.toMatch(/console\./);
  });
});
