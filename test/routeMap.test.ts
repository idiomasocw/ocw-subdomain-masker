import { describe, it, expect } from "vitest";
import * as fc from "fast-check";
import { resolveRouteMap } from "../src/routeMap";
import { DEFAULT_ROUTE_MAP } from "../src/constants";
import type { Env } from "../src/types";

describe("resolveRouteMap", () => {
  it("returns DEFAULT_ROUTE_MAP when ROUTE_MAP env var is absent", () => {
    expect(resolveRouteMap({})).toEqual(DEFAULT_ROUTE_MAP);
  });

  it("returns DEFAULT_ROUTE_MAP when ROUTE_MAP is an empty JSON object", () => {
    expect(resolveRouteMap({ ROUTE_MAP: "{}" })).toEqual(DEFAULT_ROUTE_MAP);
  });

  it("returns DEFAULT_ROUTE_MAP when ROUTE_MAP is invalid JSON", () => {
    expect(resolveRouteMap({ ROUTE_MAP: "not-json" })).toEqual(DEFAULT_ROUTE_MAP);
  });

  it("returns parsed map when ROUTE_MAP is valid and non-empty", () => {
    const map = { reward2: "https://example.com" };
    const env: Env = { ROUTE_MAP: JSON.stringify(map) };
    expect(resolveRouteMap(env)).toEqual(map);
  });

  it("DEFAULT_ROUTE_MAP contains the reward1 entry", () => {
    expect(DEFAULT_ROUTE_MAP.reward1).toBe(
      "https://view.genially.com/670ed038d21493d4843b3e5b",
    );
  });

  // Feature: subdomain-masker, Property 1: Route Map resolution precedence
  it("P1 — env map wins when non-empty; fallback returned when empty/absent", () => {
    fc.assert(
      fc.property(
        fc.dictionary(
          fc.stringMatching(/^[a-z][a-z0-9]*$/),
          fc.webUrl(),
          { minKeys: 1, maxKeys: 20 },
        ),
        (map) => {
          const env: Env = { ROUTE_MAP: JSON.stringify(map) };
          const result = resolveRouteMap(env);
          // All keys from the env map should be present
          for (const key of Object.keys(map)) {
            expect(result[key]).toBe(map[key]);
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});
