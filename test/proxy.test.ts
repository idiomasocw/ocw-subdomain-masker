import { describe, it, expect, vi, afterEach } from "vitest";
import * as fc from "fast-check";
import { buildPassThroughRequest, handleProxy } from "../src/handlers/proxy";
import { MAX_REDIRECTS } from "../src/constants";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

// ─── P3: Pass-Through Request construction ────────────────────────────────────

describe("buildPassThroughRequest", () => {
  it("sets Host to the target URL's hostname", () => {
    const req = new Request("https://reward1.onecultureworld.com/", {
      headers: { Accept: "text/html" },
    });
    const result = buildPassThroughRequest(req, "https://view.genially.com/abc", "GET", null);
    expect(result.headers.get("Host")).toBe("view.genially.com");
  });

  it("strips the original Host header", () => {
    const req = new Request("https://reward1.onecultureworld.com/", {
      headers: { Host: "reward1.onecultureworld.com" },
    });
    const result = buildPassThroughRequest(req, "https://example.com/", "GET", null);
    expect(result.headers.get("Host")).toBe("example.com");
  });

  it("strips all CF-* prefixed headers", () => {
    const req = new Request("https://reward1.onecultureworld.com/", {
      headers: {
        "CF-Connecting-IP": "1.2.3.4",
        "CF-Ray": "abc123-DFW",
        "CF-Visitor": '{"scheme":"https"}',
        "Accept": "text/html",
      },
    });
    const result = buildPassThroughRequest(req, "https://example.com/", "GET", null);
    expect(result.headers.get("CF-Connecting-IP")).toBeNull();
    expect(result.headers.get("CF-Ray")).toBeNull();
    expect(result.headers.get("CF-Visitor")).toBeNull();
    expect(result.headers.get("Accept")).toBe("text/html");
  });

  it("preserves regular headers that are not CF-* or Host", () => {
    const req = new Request("https://reward1.onecultureworld.com/", {
      headers: {
        Accept: "text/html",
        "Accept-Language": "en-US",
        "User-Agent": "Mozilla/5.0",
      },
    });
    const result = buildPassThroughRequest(req, "https://example.com/", "GET", null);
    expect(result.headers.get("Accept")).toBe("text/html");
    expect(result.headers.get("Accept-Language")).toBe("en-US");
    expect(result.headers.get("User-Agent")).toBe("Mozilla/5.0");
  });

  // Feature: subdomain-masker, Property 3: Pass-Through Request construction
  it("P3 — strips CF-* and Host, preserves other headers, sets correct Host", () => {
    const validName = fc
      .stringMatching(/^[a-zA-Z][a-zA-Z0-9-]*$/)
      .filter(
        (k) =>
          k.toLowerCase() !== "host" && !k.toLowerCase().startsWith("cf-"),
      );

    fc.assert(
      fc.property(
        // Header values: printable ASCII, no spaces (Headers trims leading/trailing whitespace).
        // Dedupe keys case-insensitively: HTTP header names are case-insensitive, so two
        // generated keys differing only in case would collapse in the Headers object and
        // break the "every header survives" assertion (a generator artifact, not a real bug).
        fc
          .dictionary(validName, fc.stringMatching(/^[a-zA-Z0-9\-_,.;:=+@/]{1,40}$/), { maxKeys: 8 })
          .map((dict) => {
            const seen = new Set<string>();
            const out: Record<string, string> = {};
            for (const [k, v] of Object.entries(dict)) {
              const lower = k.toLowerCase();
              if (seen.has(lower)) continue;
              seen.add(lower);
              out[k] = v;
            }
            return out;
          }),
        fc.array(fc.stringMatching(/^[A-Za-z0-9]+$/), { maxLength: 4 }),
        fc.domain().map((d) => `https://${d}/path`),
        (regularHeaders, cfSuffixes, targetUrl) => {
          const allHeaders: Record<string, string> = {
            ...regularHeaders,
            Host: "original.onecultureworld.com",
          };
          for (const suffix of cfSuffixes) {
            allHeaders[`CF-${suffix}`] = "cf-value";
          }

          const req = new Request("https://reward1.onecultureworld.com/", {
            headers: allHeaders,
          });
          const result = buildPassThroughRequest(req, targetUrl, "GET", null);

          // Host must match the target hostname
          expect(result.headers.get("Host")).toBe(new URL(targetUrl).hostname);

          // No CF-* headers
          for (const suffix of cfSuffixes) {
            expect(result.headers.get(`CF-${suffix}`)).toBeNull();
          }

          // All regular headers must survive
          for (const [key, value] of Object.entries(regularHeaders)) {
            expect(result.headers.get(key)).toBe(value);
          }
        },
      ),
      { numRuns: 200 },
    );
  });
});

// ─── P4: Redirect limit enforcement ──────────────────────────────────────────

function makeRedirectMock(hops: number): typeof fetch {
  let calls = 0;
  return vi.fn().mockImplementation(async () => {
    calls++;
    if (calls <= hops) {
      return new Response(null, {
        status: 302,
        headers: { Location: "https://example.com/next" },
      });
    }
    return new Response("Final", { status: 200 });
  }) as unknown as typeof fetch;
}

describe("redirect limit (P4)", () => {
  // Feature: subdomain-masker, Property 4: Redirect limit enforcement
  const cases = Array.from({ length: MAX_REDIRECTS + 6 }, (_, i) => i); // 0..10

  it.each(cases)("redirect chain of %i hop(s)", async (hops) => {
    vi.stubGlobal("fetch", makeRedirectMock(hops));

    const req = new Request("https://reward1.onecultureworld.com/");
    const res = await handleProxy(req, "https://example.com/start", "reward1", 0);

    if (hops <= MAX_REDIRECTS) {
      expect(res.status).toBe(200);
    } else {
      expect(res.status).toBe(502);
      expect(await res.text()).toBe("Too many redirects");
    }
  });
});

// ─── P10: Upstream error status propagation ───────────────────────────────────

describe("upstream error propagation (P10)", () => {
  const errorStatuses = [400, 401, 403, 404, 422, 429, 500, 502, 503, 504];

  // Feature: subdomain-masker, Property 10: Upstream error status propagation
  it.each(errorStatuses)(
    "propagates upstream %i with verbatim body",
    async (status) => {
      const body = `Upstream error ${status}`;
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue(new Response(body, { status })),
      );

      const req = new Request("https://reward1.onecultureworld.com/");
      const res = await handleProxy(req, "https://example.com/", "reward1", 0);

      expect(res.status).toBe(status);
      expect(await res.text()).toBe(body);
    },
  );
});

// ─── Task 9.4: Proxy error paths ─────────────────────────────────────────────

describe("proxy error paths", () => {
  it("returns 502 on network/DNS error (fetch throws TypeError)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new TypeError("Failed to fetch")),
    );

    const req = new Request("https://reward1.onecultureworld.com/");
    const res = await handleProxy(req, "https://example.com/", "reward1", 0);

    expect(res.status).toBe(502);
    expect(await res.text()).toBe("Upstream connection failed");
  });

  it("returns 502 on unexpected upstream error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new Error("some unexpected error")),
    );

    const req = new Request("https://reward1.onecultureworld.com/");
    const res = await handleProxy(req, "https://example.com/", "reward1", 0);

    expect(res.status).toBe(502);
    expect(await res.text()).toBe("Upstream connection failed");
  });

  it("returns 504 when upstream times out (AbortError)", async () => {
    // Mock fetch to respect the AbortSignal
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((_url: string, options: RequestInit) => {
        return new Promise<Response>((_resolve, reject) => {
          options?.signal?.addEventListener("abort", () => {
            reject(new DOMException("The operation was aborted.", "AbortError"));
          });
        });
      }),
    );

    vi.useFakeTimers();
    const proxyPromise = handleProxy(
      new Request("https://reward1.onecultureworld.com/"),
      "https://example.com/",
      "reward1",
      0,
    );
    // Advance time past the 30s timeout
    await vi.runAllTimersAsync();
    const res = await proxyPromise;
    vi.useRealTimers();

    expect(res.status).toBe(504);
    expect(await res.text()).toBe("Upstream timed out");
  });
});
