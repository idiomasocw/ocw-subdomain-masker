import { describe, it, expect } from "vitest";
import { SELF } from "cloudflare:test";

// Integration tests against the full worker via the Workers test harness.
// These run inside the actual workerd runtime.

describe("router — OPTIONS", () => {
  it("returns 204 with CORS headers for any OPTIONS request", async () => {
    const res = await SELF.fetch("https://reward1.onecultureworld.com/", {
      method: "OPTIONS",
    });
    expect(res.status).toBe(204);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("*");
    expect(res.headers.get("Access-Control-Allow-Methods")).toContain("GET");
  });
});

describe("router — health check", () => {
  it("GET /_health returns 200 {status:ok}", async () => {
    const res = await SELF.fetch("https://reward1.onecultureworld.com/_health");
    expect(res.status).toBe(200);
    const body = await res.json() as { status: string };
    expect(body.status).toBe("ok");
  });

  it("POST /_health returns 405", async () => {
    const res = await SELF.fetch("https://reward1.onecultureworld.com/_health", {
      method: "POST",
    });
    expect(res.status).toBe(405);
  });
});

describe("router — unmatched subdomain", () => {
  it("unknown subdomain returns 404 Not found", async () => {
    const res = await SELF.fetch("https://unknown-xyz.onecultureworld.com/");
    expect(res.status).toBe(404);
    expect(await res.text()).toBe("Not found");
  });
});

describe("router — security headers", () => {
  it("every response includes X-Content-Type-Options: nosniff", async () => {
    const paths = [
      "https://reward1.onecultureworld.com/_health",
      "https://unknown.onecultureworld.com/",
    ];
    for (const url of paths) {
      const res = await SELF.fetch(url);
      expect(res.headers.get("X-Content-Type-Options")).toBe("nosniff");
    }
  });
});
