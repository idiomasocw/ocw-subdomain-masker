import { describe, it, expect } from "vitest";
import * as fc from "fast-check";
import { extractSubdomain } from "../src/subdomain";

describe("extractSubdomain", () => {
  it("returns the leftmost label for a normal subdomain hostname", () => {
    expect(extractSubdomain("reward1.onecultureworld.com")).toBe("reward1");
  });

  it("returns null for an apex domain (no dot)", () => {
    expect(extractSubdomain("onecultureworld")).toBeNull();
  });

  it("returns null for empty string", () => {
    expect(extractSubdomain("")).toBeNull();
  });

  it("returns 'www' for www.example.com", () => {
    expect(extractSubdomain("www.example.com")).toBe("www");
  });

  // Feature: subdomain-masker, Property 7: Apex domain returns 404
  it("P7 — returns null for any hostname without a dot", () => {
    fc.assert(
      fc.property(
        fc.stringMatching(/^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/),
        (hostname) => {
          expect(extractSubdomain(hostname)).toBeNull();
        },
      ),
      { numRuns: 100 },
    );
  });

  // Feature: subdomain-masker, Property 7: Apex domain returns 404 (has dot → not null)
  it("P7 — returns a string for any hostname that contains a dot", () => {
    fc.assert(
      fc.property(
        fc.stringMatching(/^[a-z]+\.[a-z]+$/),
        (hostname) => {
          expect(typeof extractSubdomain(hostname)).toBe("string");
        },
      ),
      { numRuns: 100 },
    );
  });
});
