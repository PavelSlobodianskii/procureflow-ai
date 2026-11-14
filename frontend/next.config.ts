import type { NextConfig } from "next";

/**
 * Where the browser's same-origin calls to /api/v1/* are forwarded.
 *
 * - Read from the BACKEND_URL environment variable (set in PowerShell, never in a .env file).
 * - Default: the real backend on 127.0.0.1:8000. The mock run uses http://127.0.0.1:8001.
 * - Loopback addresses are accepted exactly as before (task 0001, F6).
 * - Any other host is refused unless ALL of these hold (task 0002, phase 2a):
 *     BACKEND_ALLOW_REMOTE is exactly "1", the scheme is https, there is no user name or
 *     password, the path is empty or "/", and there is no query and no fragment.
 *   Anything else stops the build with an error that never prints the value.
 * - Rewrites are read when Next.js starts (dev) or builds (production), so set BACKEND_URL first
 *   and build again after changing it.
 * - The gateway token is NOT handled here. proxy.ts adds it per request, so it is never part of
 *   the build output.
 */
const DEFAULT_BACKEND_URL = "http://127.0.0.1:8000";
const LOOPBACK_HOSTNAMES = new Set(["127.0.0.1", "localhost", "[::1]"]);

function requireSafeRemote(url: URL, raw: string): void {
  if (process.env.BACKEND_ALLOW_REMOTE !== "1") {
    throw new Error(
      "BACKEND_URL must point to this computer (127.0.0.1, localhost or [::1]). " +
        "A remote backend is allowed only when BACKEND_ALLOW_REMOTE is exactly 1.",
    );
  }
  if (url.protocol !== "https:") {
    throw new Error("A remote BACKEND_URL must start with https://");
  }
  // "#" and "?" are checked on the raw text: the URL parser drops an empty query or fragment.
  if ((url.pathname !== "" && url.pathname !== "/") || raw.includes("?") || raw.includes("#")) {
    throw new Error("A remote BACKEND_URL must be an origin only: no path, query or fragment.");
  }
}

function resolveBackendOrigin(): string {
  const raw = process.env.BACKEND_URL?.trim() || DEFAULT_BACKEND_URL;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    // The value is deliberately not printed: it could contain credentials by mistake.
    throw new Error("BACKEND_URL is not a valid URL. Example: http://127.0.0.1:8000");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("BACKEND_URL must start with http:// or https://");
  }
  if (url.username || url.password) {
    throw new Error("BACKEND_URL must not contain a user name or password.");
  }
  if (!LOOPBACK_HOSTNAMES.has(url.hostname)) {
    requireSafeRemote(url, raw);
  }
  return url.origin;
}

const backendOrigin = resolveBackendOrigin();

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // Same-origin proxy: the browser only ever talks to the Next.js origin, so CORS stays disabled.
  async rewrites() {
    return [{ source: "/api/v1/:path*", destination: `${backendOrigin}/api/v1/:path*` }];
  },
  // Baseline security headers for pages. Proxied /api responses keep the backend's own headers.
  // A strict script CSP needs per-request nonces and belongs with the Caddy proxy later (lead's call).
  async headers() {
    return [
      {
        source: "/((?!api/).*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "no-referrer" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
    ];
  },
};

export default nextConfig;
