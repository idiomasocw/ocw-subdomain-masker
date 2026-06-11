import type { RouteMap } from "./types";

export const MAX_REDIRECTS = 5;
export const UPSTREAM_TIMEOUT_MS = 30_000;

export const DEFAULT_ROUTE_MAP: RouteMap = {
  reward1: "https://view.genially.com/670ed038d21493d4843b3e5b",
};

// NOTE: We deliberately do NOT inject a Content-Security-Policy here.
// This Worker transparently proxies a third-party app (Genially) that we do
// not author. Genially ships its own CSP, and its drag-and-drop engine relies
// on eval() (loadScript). Overwriting the upstream CSP with our own broke that
// (EvalError: 'unsafe-eval' not allowed). Passing the upstream CSP through
// unchanged guarantees the proxied content behaves exactly as it does natively.
export const SECURITY_HEADERS: Record<string, string> = {
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "SAMEORIGIN",
  "Referrer-Policy": "no-referrer",
  "Access-Control-Allow-Origin": "*",
};

export const HEADERS_TO_REMOVE = ["Server", "X-Powered-By"];

export const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, HEAD, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Max-Age": "86400",
};
