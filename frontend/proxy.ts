import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * Adds the server-side credentials to requests that are forwarded to the backend
 * (task 0002, phase 2a). It runs on the server only, for /api/v1/* only.
 *
 * - BACKEND_GATEWAY_TOKEN: sent as "x-procureflow-gateway". The backend refuses every request
 *   without it. Unset in local development, where the backend has no gate.
 * - BACKEND_PROTECTION_BYPASS: optional. Sent as "x-vercel-protection-bypass" so that this
 *   project can reach a backend project that keeps Vercel Authentication switched on.
 *
 * Both values are secrets set by the owner in the hosting dashboard. They are read here per
 * request, never logged, never sent to the browser and never given a browser-visible ("public") variable name.
 * A value for these headers that arrives from the browser is always removed first, so a visitor
 * can neither supply nor probe a token.
 */
const SERVER_ONLY_HEADERS = {
  "x-procureflow-gateway": "BACKEND_GATEWAY_TOKEN",
  "x-vercel-protection-bypass": "BACKEND_PROTECTION_BYPASS",
} as const;

export function proxy(request: NextRequest) {
  const headers = new Headers(request.headers);
  for (const [header, variable] of Object.entries(SERVER_ONLY_HEADERS)) {
    headers.delete(header);
    const value = process.env[variable];
    if (value) headers.set(header, value);
  }
  // "request.headers" changes what is sent on to the backend. It adds nothing to the response.
  return NextResponse.next({ request: { headers } });
}

export const config = {
  matcher: "/api/v1/:path*",
};
