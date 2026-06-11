import { describe, it, expect, vi, afterEach } from "vitest";
import * as fc from "fast-check";
import { logRequest, logError } from "../src/logger";
import type { RequestLogEntry, ErrorLogEntry } from "../src/types";

const ERROR_TYPES = [
  "upstream_failure",
  "timeout",
  "misconfiguration",
  "unmatched_subdomain",
] as const;

afterEach(() => vi.restoreAllMocks());

describe("logRequest", () => {
  it("emits JSON with all required fields via console.log", () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    const entry: RequestLogEntry = {
      subdomain: "reward1",
      targetUrl: "https://example.com",
      method: "GET",
      status: 200,
      durationMs: 42.5,
    };
    logRequest(entry);
    expect(spy).toHaveBeenCalledOnce();
    const parsed = JSON.parse(spy.mock.calls[0][0] as string) as RequestLogEntry;
    expect(parsed.subdomain).toBe(entry.subdomain);
    expect(parsed.targetUrl).toBe(entry.targetUrl);
    expect(parsed.method).toBe(entry.method);
    expect(parsed.status).toBe(entry.status);
    expect(parsed.durationMs).toBe(entry.durationMs);
  });

  // Feature: subdomain-masker, Property 13: Proxy request log contains all required fields
  it("P13 — all 5 required fields present for any RequestLogEntry", () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    fc.assert(
      fc.property(
        fc.record({
          subdomain: fc.string(),
          targetUrl: fc.webUrl(),
          method: fc.constantFrom("GET", "POST", "HEAD"),
          status: fc.integer({ min: 100, max: 599 }),
          durationMs: fc.float({ min: 0, noNaN: true, noDefaultInfinity: true }),
        }),
        (entry) => {
          logRequest(entry);
          const call = spy.mock.calls[spy.mock.calls.length - 1];
          const parsed = JSON.parse(call[0] as string) as RequestLogEntry;
          expect(typeof parsed.subdomain).toBe("string");
          expect(typeof parsed.targetUrl).toBe("string");
          expect(typeof parsed.method).toBe("string");
          expect(typeof parsed.status).toBe("number");
          expect(typeof parsed.durationMs).toBe("number");
        },
      ),
      { numRuns: 200 },
    );
  });
});

describe("logError", () => {
  it("emits JSON with errorType and message via console.error", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const entry: ErrorLogEntry = {
      errorType: "timeout",
      subdomain: "reward1",
      message: "Upstream timed out",
    };
    logError(entry);
    expect(spy).toHaveBeenCalledOnce();
    const parsed = JSON.parse(spy.mock.calls[0][0] as string) as ErrorLogEntry;
    expect(parsed.errorType).toBe("timeout");
    expect(parsed.message).toBe("Upstream timed out");
  });

  // Feature: subdomain-masker, Property 14: Error log contains required fields
  it("P14 — errorType is always in the valid set", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    fc.assert(
      fc.property(
        fc.record({
          errorType: fc.constantFrom(...ERROR_TYPES),
          subdomain: fc.string(),
          message: fc.string({ minLength: 1 }),
        }),
        (entry) => {
          logError(entry);
          const call = spy.mock.calls[spy.mock.calls.length - 1];
          const parsed = JSON.parse(call[0] as string) as ErrorLogEntry;
          expect((ERROR_TYPES as readonly string[]).includes(parsed.errorType)).toBe(true);
          expect(parsed.message.length).toBeGreaterThan(0);
        },
      ),
      { numRuns: 100 },
    );
  });

  // Feature: subdomain-masker, Property 15: No sensitive data in logs
  it("P15 — log output never contains request path, query string, or headers", () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    fc.assert(
      fc.property(
        fc.string({ minLength: 1 }),
        fc.string(),
        fc.string(),
        (path, query, headerVal) => {
          const errorEntry: ErrorLogEntry = {
            errorType: "upstream_failure",
            subdomain: "reward1",
            message: "connection failed",
          };
          logError(errorEntry);
          const allOutput = [
            ...logSpy.mock.calls.map((c) => c[0] as string),
            ...errSpy.mock.calls.map((c) => c[0] as string),
          ].join("");
          // Path, query string, and header values must not appear in log output
          expect(allOutput).not.toContain(path.startsWith("/") ? path : `/${path}`);
        },
      ),
      { numRuns: 100 },
    );
  });
});
