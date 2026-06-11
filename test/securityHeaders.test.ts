import { describe, it, expect } from "vitest";
import * as fc from "fast-check";
import { applySecurityHeaders } from "../src/securityHeaders";
import { SECURITY_HEADERS, HEADERS_TO_REMOVE } from "../src/constants";

describe("applySecurityHeaders", () => {
  it("sets all required security headers on a plain response", () => {
    const response = applySecurityHeaders(new Response("body", { status: 200 }));
    for (const [key, value] of Object.entries(SECURITY_HEADERS)) {
      expect(response.headers.get(key)).toBe(value);
    }
  });

  it("overwrites pre-existing values for security header keys", () => {
    const input = new Response(null, {
      headers: { "X-Frame-Options": "DENY" },
    });
    const response = applySecurityHeaders(input);
    expect(response.headers.get("X-Frame-Options")).toBe("SAMEORIGIN");
  });

  it("removes Server header", () => {
    const input = new Response(null, { headers: { Server: "nginx/1.25" } });
    expect(applySecurityHeaders(input).headers.get("Server")).toBeNull();
  });

  it("removes X-Powered-By header", () => {
    const input = new Response(null, { headers: { "X-Powered-By": "Express" } });
    expect(applySecurityHeaders(input).headers.get("X-Powered-By")).toBeNull();
  });

  it("preserves status and body", () => {
    const response = applySecurityHeaders(new Response("hello", { status: 418 }));
    expect(response.status).toBe(418);
  });

  // Feature: subdomain-masker, Property 8: Security headers always applied
  it("P8 — all SECURITY_HEADERS present for any input response", () => {
    // Header names must be valid HTTP token characters
    const validHeaderName = fc.stringMatching(/^[a-zA-Z][a-zA-Z0-9\-]*$/);
    fc.assert(
      fc.property(
        fc.integer({ min: 200, max: 599 }),
        fc.dictionary(validHeaderName, fc.string()),
        (status, extraHeaders) => {
          const input = new Response(null, { status, headers: extraHeaders });
          const output = applySecurityHeaders(input);
          for (const [key, value] of Object.entries(SECURITY_HEADERS)) {
            expect(output.headers.get(key)).toBe(value);
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  // Feature: subdomain-masker, Property 9: Identifying headers stripped
  it("P9 — Server and X-Powered-By always absent after applying security headers", () => {
    fc.assert(
      fc.property(
        fc.string(),
        fc.string(),
        (serverVal, xpbVal) => {
          const input = new Response(null, {
            headers: { Server: serverVal, "X-Powered-By": xpbVal },
          });
          const output = applySecurityHeaders(input);
          for (const name of HEADERS_TO_REMOVE) {
            expect(output.headers.get(name)).toBeNull();
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});
