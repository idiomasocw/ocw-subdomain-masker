import type { RouteMap } from "./types";

export const MAX_REDIRECTS = 5;
export const UPSTREAM_TIMEOUT_MS = 30_000;

export const DEFAULT_ROUTE_MAP: RouteMap = {
  reward1: "https://view.genially.com/670ed038d21493d4843b3e5b",
};

export const SECURITY_HEADERS: Record<string, string> = {
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "SAMEORIGIN",
  "Referrer-Policy": "no-referrer",
  "Content-Security-Policy":
    "default-src 'self' https:; img-src 'self' https: data:; style-src 'self' https: 'unsafe-inline'; script-src 'self' https: 'unsafe-inline'",
  "Access-Control-Allow-Origin": "*",
};

export const HEADERS_TO_REMOVE = ["Server", "X-Powered-By"];

export const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, HEAD, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Max-Age": "86400",
};
