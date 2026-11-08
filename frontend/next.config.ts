import type { NextConfig } from "next";

/**
 * Where the browser's same-origin calls to /api/v1/* are forwarded.
 *
 * - Read from the BACKEND_URL environment variable (set in PowerShell, never in a .env file).
 * - Default: the real backend on 127.0.0.1:8000. The mock run uses http://127.0.0.1:8001.
 * - Only loopback addresses are accepted. In this slice the frontend must never forward
 *   traffic to an external host (task 0001, F6). Anything else stops the build with an error.
 * - Rewrites are read when Next.js starts (dev) or builds (production), so set BACKEND_URL first.
 */
const DEFAULT_BACKEND_URL = "http://127.0.0.1:8000";
const LOOPBACK_HOSTNAMES = new Set(["127.0.0.1", "localhost", "[::1]"]);

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
    throw new Error(
      "BACKEND_URL must point to this computer (127.0.0.1, localhost or [::1]). " +
        "External hosts are not allowed in this slice.",
    );
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
