import { describe, it, expect, vi, afterEach } from "vitest";
import { SELF } from "cloudflare:test";
import * as fc from "fast-check";
import { route } from "../src/router";
import { DEFAULT_ROUTE_MAP } from "../src/constants";
import type { Env } from "../src/types";

// Integration tests run inside the actual workerd runtime via SELF.fetch.
// Unit tests call route() directly to avoid needing a live upstream.

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

// ─── OPTIONS ──────────────────────────────────────────────────────────────────

describe("router — OPTIONS", () => {
  it("returns 204 with CORS headers for any OPTIONS request", async () => {
    const res = await SELF.fetch("https://reward1.onecultureworld.com/", {
      method: "OPTIONS",
    });
    expect(res.status).toBe(204);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("*");
    expect(res.headers.get("Access-Control-Allow-Methods")).toContain("GET");
  });

  // Feature: subdomain-masker, Property 11: OPTIONS always returns CORS preflight
  it("P11 — OPTIONS short-circuits regardless of subdomain or path", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.stringMatching(/^[a-z][a-z0-9-]{0,20}$/),
        fc.stringMatching(/^\/[a-z0-9/_-]{0,30}$/),
        async (subdomain, path) => {
          const req = new Request(
            `https://${subdomain}.onecultureworld.com${path}`,
            { method: "OPTIONS" },
          );
          const res = await route(req, {} as Env, 0);
          expect(res.status).toBe(204);
          expect(res.headers.get("Access-Control-Allow-Origin")).toBe("*");
        },
      ),
      { numRuns: 50 },
    );
  });
});

// ─── Health check ─────────────────────────────────────────────────────────────

describe("router — health check", () => {
  it("GET /_health returns 200 {status:ok}", async () => {
    const res = await SELF.fetch("https://reward1.onecultureworld.com/_health");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { status: string };
    expect(body.status).toBe("ok");
  });

  it("GET /_health works even when ROUTE_MAP env var is empty", async () => {
    const req = new Request("https://reward1.onecultureworld.com/_health");
    const res = await route(req, { ROUTE_MAP: "{}" } as Env, 0);
    expect(res.status).toBe(200);
  });

  it("POST /_health returns 405", async () => {
    const res = await SELF.fetch("https://reward1.onecultureworld.com/_health", {
      method: "POST",
    });
    expect(res.status).toBe(405);
  });

  // Feature: subdomain-masker, Property 12: Non-GET requests to /_health return 405
  it("P12 — any non-GET method to /_health returns 405", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom("POST", "PUT", "PATCH", "DELETE", "HEAD"),
        async (method) => {
          const req = new Request("https://reward1.onecultureworld.com/_health", {
            method,
            // HEAD/GET cannot have a body; others can
            body: method !== "HEAD" ? null : undefined,
          });
          const res = await route(req, {} as Env, 0);
          expect(res.status).toBe(405);
          if (method !== "HEAD") {
            expect(await res.text()).toBe("Method not allowed");
          }
        },
      ),
      { numRuns: 50 },
    );
  });
});

// ─── Unmatched subdomain ──────────────────────────────────────────────────────

describe("router — unmatched subdomain", () => {
  it("unknown subdomain returns 404 Not found", async () => {
    const res = await SELF.fetch("https://unknown-xyz.onecultureworld.com/");
    expect(res.status).toBe(404);
    expect(await res.text()).toBe("Not found");
  });

  // Task 11.5: apex domain → 404
  it("apex domain (no subdomain) returns 404", async () => {
    const req = new Request("https://onecultureworld.com/");
    const res = await route(req, {} as Env, 0);
    expect(res.status).toBe(404);
    expect(await res.text()).toBe("Not found");
  });

  // Feature: subdomain-masker, Property 6: Unmatched subdomain returns 404
  it("P6 — any subdomain not in the route map returns 404", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.stringMatching(/^[a-z][a-z0-9-]{3,20}$/).filter(
          (s) => !(s in DEFAULT_ROUTE_MAP),
        ),
        async (subdomain) => {
          const req = new Request(
            `https://${subdomain}.onecultureworld.com/`,
          );
          const res = await route(req, {} as Env, 0);
          expect(res.status).toBe(404);
          expect(await res.text()).toBe("Not found");
        },
      ),
      { numRuns: 50 },
    );
  });
});

// ─── Route map edge cases (task 11.5) ─────────────────────────────────────────

describe("router — route map", () => {
  // Task 11.5: ROUTE_MAP='{}' falls back to DEFAULT_ROUTE_MAP — reward1 still proxies.
  // The 503 branch is only reachable if DEFAULT_ROUTE_MAP is also emptied (not the
  // case in production; the resolveRouteMap unit tests cover that contract directly).
  it("ROUTE_MAP='{}' falls back to DEFAULT_ROUTE_MAP and proxies reward1", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("ok", { status: 200 })),
    );
    const req = new Request("https://reward1.onecultureworld.com/");
    const res = await route(req, { ROUTE_MAP: "{}" } as Env, 0);
    expect(res.status).toBe(200); // reward1 is in DEFAULT_ROUTE_MAP
  });

  // Task 11.5: reward1 in DEFAULT_ROUTE_MAP resolves (doesn't 404)
  it("DEFAULT_ROUTE_MAP reward1 entry proxies (does not return 404)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("OK", { status: 200 })),
    );
    const req = new Request("https://reward1.onecultureworld.com/");
    const res = await route(req, {} as Env, 0);
    expect(res.status).not.toBe(404);
    expect(res.status).not.toBe(503);
  });

  // Feature: subdomain-masker, Property 2: Route Map lookup correctness
  it("P2 — any subdomain present in the route map is proxied (not 404/503)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("proxied", { status: 200 })),
    );
    await fc.assert(
      fc.asyncProperty(
        fc.dictionary(
          fc.stringMatching(/^[a-z][a-z0-9]{1,15}$/),
          fc.domain().map((d) => `https://${d}/`),
          { minKeys: 1, maxKeys: 10 },
        ),
        async (routeMap) => {
          const key = Object.keys(routeMap)[0];
          const req = new Request(`https://${key}.onecultureworld.com/`);
          const env: Env = { ROUTE_MAP: JSON.stringify(routeMap) };
          const res = await route(req, env, 0);
          expect(res.status).not.toBe(404);
          expect(res.status).not.toBe(503);
        },
      ),
      { numRuns: 50 },
    );
  });
});

// ─── Security headers ─────────────────────────────────────────────────────────

describe("router — security headers", () => {
  it("every response includes X-Content-Type-Options: nosniff", async () => {
    const urls = [
      "https://reward1.onecultureworld.com/_health",
      "https://unknown.onecultureworld.com/",
    ];
    for (const url of urls) {
      const res = await SELF.fetch(url);
      expect(res.headers.get("X-Content-Type-Options")).toBe("nosniff");
    }
  });

  it("OPTIONS response includes Access-Control-Allow-Origin: *", async () => {
    const res = await SELF.fetch("https://reward1.onecultureworld.com/", {
      method: "OPTIONS",
    });
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("*");
  });
});
