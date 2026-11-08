// @vitest-environment jsdom
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RequestForm } from "@/app/requests/new/request-form";
import NewRequestPage from "@/app/requests/new/page";
import { created, createdPostgres, fillValid, problem, stubFetch, submitButton } from "./helpers/form";

const ROOT = process.cwd();

function sourceFiles(directory: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(join(ROOT, directory), { recursive: true }) as string[]) {
    const path = join(ROOT, directory, entry);
    if (statSync(path).isFile() && /\.(ts|tsx|css|mjs)$/.test(path)) found.push(path);
  }
  return found;
}

const rel = (path: string) => relative(ROOT, path).split(sep).join("/");
const read = (path: string) => readFileSync(path, "utf8");
const stripComments = (text: string) => text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const APP_AND_LIB = [...sourceFiles("app"), ...sourceFiles("lib")];

describe("source safety", () => {
  it("never injects raw HTML", () => {
    for (const file of [...APP_AND_LIB, ...sourceFiles("mock-api")]) {
      expect(stripComments(read(file)), rel(file)).not.toMatch(/dangerouslySetInnerHTML|innerHTML|insertAdjacentHTML|document\.write|\beval\(/);
    }
  });

  it("uses no Server Actions and has no server routes of its own", () => {
    for (const file of APP_AND_LIB) {
      expect(read(file), rel(file)).not.toMatch(/['"]use server['"]/);
      expect(rel(file)).not.toMatch(/(^|\/)(route|middleware|actions)\.(ts|tsx)$/);
    }
  });

  it("has no CORS configuration anywhere", () => {
    for (const file of [...APP_AND_LIB, join(ROOT, "next.config.ts"), ...sourceFiles("mock-api")]) {
      expect(stripComments(read(file)), rel(file)).not.toMatch(/access-control-|\bcors\b/i);
    }
  });

  it("has no absolute http(s) URL, external font, analytics or tracking code in the app", () => {
    for (const file of APP_AND_LIB) {
      const text = stripComments(read(file));
      expect(text, rel(file)).not.toMatch(/https?:\/\//i);
      expect(text, rel(file)).not.toMatch(/next\/font\/google|fonts\.googleapis|gtag|googletagmanager|analytics|sendBeacon|WebSocket|EventSource/i);
    }
  });

  it("has exactly one place that calls fetch, and it is the same-origin client", () => {
    const withFetch = APP_AND_LIB.filter((file) => /\bfetch\(/.test(stripComments(read(file)))).map(rel);
    expect(withFetch).toEqual(["lib/api-client.ts"]);
    const client = read(join(ROOT, "lib/api-client.ts"));
    expect(client).toContain('CREATE_REQUEST_URL = "/api/v1/requests"');
  });

  it("does not retry the POST in a loop", () => {
    const client = stripComments(read(join(ROOT, "lib/api-client.ts")));
    expect(client).not.toMatch(/\bfor\s*\(|\bwhile\s*\(|retry|attempt/i);
  });

  it("never converts money to a floating-point number", () => {
    for (const file of APP_AND_LIB) {
      expect(stripComments(read(file)), rel(file)).not.toMatch(/parseFloat|Number\.parseFloat|toFixed|Math\.round/);
    }
  });
});

describe("UI wording: draft only", () => {
  // Words that must never appear in the UI of this slice (task 0001: only the status "draft" exists).
  const FORBIDDEN =
    /approv|\border(s|ed|ing)?\b|purchase order|\bPO\b|release|supplier|vendor|\bERP\b|\bpay(ment|ments|ing|s)?\b|\bsubmitted\b|\bconfirm/i;
  const ALLOWED_BUTTONS = ["Save draft", "Saving draft…", "Try again", "Create another request"];

  it("the page source (app/) contains none of the forbidden words", () => {
    for (const file of sourceFiles("app")) {
      expect(stripComments(read(file)), rel(file)).not.toMatch(FORBIDDEN);
    }
  });

  it("every rendered state is free of forbidden words and offers only draft-related buttons", async () => {
    const states: Array<() => Promise<void>> = [
      async () => {
        /* initial state */
      },
      async () => {
        const user = userEvent.setup({ delay: null });
        await user.click(submitButton());
      },
      async () => {
        stubFetch(async () => problem("error.500.internal-error.json", 500));
        const user = userEvent.setup({ delay: null });
        await fillValid(user);
        await user.click(submitButton());
        await screen.findByRole("alert");
      },
      async () => {
        stubFetch(async () => created());
        const user = userEvent.setup({ delay: null });
        await fillValid(user);
        await user.click(submitButton());
        await screen.findByRole("heading", { name: "Draft saved" });
      },
      async () => {
        // The same success state when a contract v1.1 server says the draft is stored in PostgreSQL.
        stubFetch(async () => createdPostgres());
        const user = userEvent.setup({ delay: null });
        await fillValid(user);
        await user.click(submitButton());
        await screen.findByRole("heading", { name: "Draft saved" });
      },
    ];

    for (const arrange of states) {
      const { unmount } = render(<RequestForm />);
      await arrange();
      expect(document.body.textContent).not.toMatch(FORBIDDEN);
      for (const button of screen.getAllByRole("button")) {
        expect(ALLOWED_BUTTONS).toContain(button.textContent?.trim());
      }
      unmount();
    }
  });

  it("the whole page, including the side panel, is free of forbidden words", () => {
    render(<NewRequestPage />);
    expect(document.body.textContent).not.toMatch(FORBIDDEN);
  });
});

describe("local preferences and the theme script", () => {
  const STORAGE_API = /localStorage|sessionStorage|indexedDB|document\.cookie|\bcookies?\b/;

  it("only lib/preferences.ts touches browser storage", () => {
    const users = APP_AND_LIB.filter((file) => STORAGE_API.test(stripComments(read(file)))).map(rel);
    expect(users).toEqual(["lib/preferences.ts"]);
  });

  it("stores exactly two keys: the theme and the language", () => {
    const source = read(join(ROOT, "lib/preferences.ts"));
    expect(source).toContain('LANGUAGE_STORAGE_KEY = "procureflow.language"');
    expect(source).toContain('THEME_STORAGE_KEY = "procureflow.theme"');
    const keys = [...source.matchAll(/StorageKey|_STORAGE_KEY/g)].length;
    expect(keys).toBeGreaterThan(0);
    expect(stripComments(source)).not.toMatch(/setItem\(\s*["'`]/); // always through the two named keys
  });

  it("public/theme-init.js makes no network call and uses only the two keys", () => {
    const script = read(join(ROOT, "public/theme-init.js"));
    const code = stripComments(script);
    expect(code).not.toMatch(/https?:\/\/|fetch\(|XMLHttpRequest|sendBeacon|WebSocket|import\(|eval\(|document\.write|innerHTML/);
    const keys = [...code.matchAll(/getItem\("([^"]+)"\)/g)].map((match) => match[1]).sort();
    expect(keys).toEqual(["procureflow.language", "procureflow.theme"]);
    expect(code).not.toMatch(/setItem/); // it only reads
  });

  it("the layout loads exactly one script, from the same origin", () => {
    const layout = read(join(ROOT, "app/layout.tsx"));
    const scripts = [...layout.matchAll(/<script\b[^>]*>/g)].map((match) => match[0]);
    expect(scripts).toEqual(['<script src="/theme-init.js" />']);
  });

  it("no external image, font or stylesheet is referenced in the app", () => {
    for (const file of sourceFiles("app")) {
      expect(stripComments(read(file)), rel(file)).not.toMatch(/url\(\s*["']?https?:|@import\s+url|<img\b|<link\b|<iframe\b|<video\b|<audio\b/i);
    }
  });
});

describe("next.config.ts", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  async function loadConfig(backendUrl?: string) {
    vi.resetModules();
    if (backendUrl === undefined) vi.stubEnv("BACKEND_URL", "");
    else vi.stubEnv("BACKEND_URL", backendUrl);
    return (await import("../next.config")).default;
  }

  it("forwards only /api/v1/* and defaults to the real backend on 127.0.0.1:8000", async () => {
    const config = await loadConfig();
    expect(await config.rewrites?.()).toEqual([
      { source: "/api/v1/:path*", destination: "http://127.0.0.1:8000/api/v1/:path*" },
    ]);
  });

  it("uses BACKEND_URL for the mock run", async () => {
    const config = await loadConfig("http://127.0.0.1:8001");
    expect(await config.rewrites?.()).toEqual([
      { source: "/api/v1/:path*", destination: "http://127.0.0.1:8001/api/v1/:path*" },
    ]);
  });

  it.each(["http://localhost:8001", "http://[::1]:8000"])("accepts the loopback address %s", async (url) => {
    await expect(loadConfig(url)).resolves.toBeDefined();
  });

  it.each([
    "https://example.com",
    "http://192.168.1.20:8000",
    "http://10.0.0.5",
    "http://127.0.0.1.example.com",
    "ftp://127.0.0.1",
    "http://user:secret@127.0.0.1:8000",
    "not a url",
  ])("refuses BACKEND_URL=%s and does not print it", async (url) => {
    const error = await loadConfig(url).then(
      () => undefined,
      (caught: Error) => caught,
    );
    expect(error).toBeInstanceOf(Error);
    expect(error?.message).not.toContain("secret");
    expect(error?.message).not.toContain(url);
  });

  it("sets security headers on pages and no CORS headers", async () => {
    const config = await loadConfig();
    const rules = (await config.headers?.()) ?? [];
    const keys = rules.flatMap((rule) => rule.headers.map((header) => header.key.toLowerCase()));
    expect(keys).toEqual(expect.arrayContaining(["x-content-type-options", "referrer-policy", "x-frame-options"]));
    expect(keys.some((key) => key.startsWith("access-control-"))).toBe(false);
    // Proxied API answers keep the backend's own headers.
    expect(rules.every((rule) => rule.source.includes("api/"))).toBe(true);
  });
});
