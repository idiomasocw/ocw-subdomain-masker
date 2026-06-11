# Implementation Plan: subdomain-masker

## Overview

Implement a Cloudflare Worker in TypeScript that performs transparent subdomain proxying. The implementation proceeds bottom-up: types and constants first, then pure utility functions (subdomain extractor, route map resolver, request sanitiser, HTML rewriter, security headers applier, logger), then the handler layer (CORS, health check, proxy), and finally the top-level router and entry point. Property-based tests (fast-check) and unit tests (Vitest + `@cloudflare/vitest-pool-workers`) are added alongside each component.

---

## Tasks

- [ ] 1. Scaffold project structure, types, and constants
  - Create `package.json` — scripts: `dev` (wrangler dev), `deploy` (wrangler deploy), `test` (vitest run), `test:watch` (vitest); devDependencies: `wrangler`, `typescript`, `@cloudflare/workers-types`, `@cloudflare/vitest-pool-workers`, `vitest`, `fast-check`
  - Create `wrangler.toml` — set `name`, `main = "src/index.ts"`, `compatibility_date`; add a commented-out `[vars]` section showing how to set `ROUTE_MAP`; add a commented-out `[[routes]]` placeholder
  - Create `tsconfig.json` — `target: "ES2022"`, `module: "ES2022"`, `moduleResolution: "bundler"`, `types: ["@cloudflare/workers-types"]`, `strict: true`, `noEmit: true`
  - Create `.gitignore` — include `node_modules/`, `dist/`, `.wrangler/`, `.dev.vars` (local env overrides — must not be committed)
  - Create `vitest.config.ts` — use `defineWorkersConfig` from `@cloudflare/vitest-pool-workers/config`, pointing `wrangler.configPath` at `./wrangler.toml`
  - Create `src/types.ts` — export `Env`, `RouteMap`, `RequestLogEntry`, `ErrorLogEntry` interfaces
  - Create `src/constants.ts` — export `DEFAULT_ROUTE_MAP`, `SECURITY_HEADERS`, `HEADERS_TO_REMOVE`, `CORS_HEADERS`, `MAX_REDIRECTS = 5`, `UPSTREAM_TIMEOUT_MS = 30_000`
  - Create `src/index.ts` with an empty `export default { async fetch() {} }` stub so the project compiles
  - _Requirements: 1.1, 1.5, 2.4, 4.1, 6.1_

- [ ] 2. Implement `extractSubdomain` and `resolveRouteMap`
  - [ ] 2.1 Implement `extractSubdomain(hostname: string): string | null` in `src/subdomain.ts`
    - Return the leftmost dot-delimited label, or `null` for apex hostnames (no dot present) or empty strings
    - _Requirements: 3.1, 3.2_
  - [ ]\* 2.2 Write property test for `extractSubdomain` — Property 7
    - **Property 7: Apex domain returns 404**
    - Generate hostnames without a subdomain prefix; assert `extractSubdomain()` returns `null`
    - **Validates: Requirements 3.2**
    - Tag: `// Feature: subdomain-masker, Property 7: Apex domain returns 404`
  - [ ] 2.3 Implement `resolveRouteMap(env: Env): RouteMap` in `src/routeMap.ts`
    - Parse `env.ROUTE_MAP` JSON when present and non-empty; fall back to `DEFAULT_ROUTE_MAP` otherwise
    - _Requirements: 1.1, 1.2, 1.4, 1.5_
  - [ ]\* 2.4 Write property test for `resolveRouteMap` — Property 1
    - **Property 1: Route Map resolution precedence**
    - Generate env maps (empty / non-empty) and assert env map wins when non-empty, fallback constant returned otherwise
    - **Validates: Requirements 1.1**
    - Tag: `// Feature: subdomain-masker, Property 1: Route Map resolution precedence`

- [ ] 3. Implement Pass-Through Request construction
  - [ ] 3.1 Implement `buildPassThroughRequest(request: Request, targetUrl: string): Request` in `src/proxy.ts`
    - Copy all headers except `Host` and any `CF-*` prefixed headers; set `Host` to `new URL(targetUrl).hostname`
    - Preserve original method and body
    - _Requirements: 2.2, 2.3_
  - [ ]\* 3.2 Write property test for `buildPassThroughRequest` — Property 3
    - **Property 3: Pass-Through Request construction**
    - Generate requests with arbitrary mixes of `Host`, `CF-*`, and regular headers plus a target URL
    - Assert output omits `Host`/`CF-*`, preserves all other headers, and sets correct new `Host`
    - **Validates: Requirements 2.2, 2.3**
    - Tag: `// Feature: subdomain-masker, Property 3: Pass-Through Request construction`
    - Minimum 200 iterations

- [ ] 4. Implement HTML rewriter
  - [ ] 4.1 Implement `rewriteHtml(response: Response, upstreamOrigin: string): Response` in `src/htmlRewriter.ts`
    - Use the `HTMLRewriter` API to rewrite absolute URLs starting with `upstreamOrigin` in `href`, `src`, `action`, and `srcset` attributes to root-relative paths
    - Only applied when response is 2xx and `Content-Type` includes `text/html`
    - _Requirements: 2.5_
  - [ ]\* 4.2 Write property test for `rewriteHtml` — Property 5
    - **Property 5: HTML Upstream URL rewriting**
    - Generate upstream origin URLs and arrays of attribute paths containing those origins
    - Assert that after rewriting, no `href`/`src`/`action`/`srcset` value begins with the upstream origin
    - **Validates: Requirements 2.5**
    - Tag: `// Feature: subdomain-masker, Property 5: HTML Upstream URL rewriting`
    - Minimum 200 iterations

- [ ] 5. Implement security headers applier
  - [ ] 5.1 Implement `applySecurityHeaders(response: Response): Response` in `src/securityHeaders.ts`
    - Clone headers, set all `SECURITY_HEADERS` entries (overwriting existing values), remove `Server` and `X-Powered-By`
    - Return a new `Response` with the modified headers and the original body/status
    - _Requirements: 4.1, 4.2, 4.3_
  - [ ]\* 5.2 Write property test for `applySecurityHeaders` — Property 8
    - **Property 8: Security headers always applied**
    - Generate `Response` objects with arbitrary status codes and header maps
    - Assert all `SECURITY_HEADERS` are present with correct values in the output
    - **Validates: Requirements 4.1, 6.2**
    - Tag: `// Feature: subdomain-masker, Property 8: Security headers always applied`
  - [ ]\* 5.3 Write property test for `applySecurityHeaders` — Property 9
    - **Property 9: Identifying headers stripped from proxied responses**
    - Generate responses that carry random `Server` and/or `X-Powered-By` values
    - Assert neither header is present in the output response
    - **Validates: Requirements 4.2, 4.3**
    - Tag: `// Feature: subdomain-masker, Property 9: Identifying headers stripped from proxied responses`

- [ ] 6. Implement logger
  - [ ] 6.1 Implement `logRequest(entry: RequestLogEntry): void` and `logError(entry: ErrorLogEntry): void` in `src/logger.ts`
    - `logRequest` serialises the entry to JSON and calls `console.log`
    - `logError` serialises the entry to JSON and calls `console.error`
    - Neither function accesses or includes request path, query string, or headers
    - _Requirements: 8.1, 8.2, 8.3_
  - [ ]\* 6.2 Write property test for `logRequest` — Property 13
    - **Property 13: Proxy request log contains all required fields**
    - Generate `RequestLogEntry` values; capture `console.log` output; parse JSON and assert all 5 fields present with correct values
    - **Validates: Requirements 8.1**
    - Tag: `// Feature: subdomain-masker, Property 13: Proxy request log contains all required fields`
    - Minimum 200 iterations
  - [ ]\* 6.3 Write property test for `logError` — Property 14
    - **Property 14: Error log contains required fields for all error types**
    - Generate `ErrorLogEntry` values across all four `errorType` values; assert `errorType` is in the valid set and `message` is a non-empty string
    - **Validates: Requirements 8.2**
    - Tag: `// Feature: subdomain-masker, Property 14: Error log contains required fields for all error types`
  - [ ]\* 6.4 Write property test for logger — Property 15
    - **Property 15: No sensitive request data in log output**
    - Generate requests with random paths, query strings, and headers; invoke logger functions; assert no log output contains path, query, or any header name/value
    - **Validates: Requirements 8.3**
    - Tag: `// Feature: subdomain-masker, Property 15: No sensitive request data in log output`
    - Minimum 200 iterations

- [ ] 7. Checkpoint — Ensure all tests pass
  - Run `vitest --run` and confirm all utility-layer tests pass before moving to handlers.
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 8. Implement CORS and health check handlers
  - [ ] 8.1 Implement `handleCors(): Response` in `src/handlers/cors.ts`
    - Return `204 No Content` with all `CORS_HEADERS`; security headers applied via `applySecurityHeaders`
    - _Requirements: 6.1_
  - [ ]\* 8.2 Write property test for `handleCors` — Property 11
    - **Property 11: OPTIONS always returns CORS preflight response**
    - Generate OPTIONS requests with arbitrary subdomains, paths, and route map states
    - Assert always `204` + all required CORS headers, regardless of routing context
    - **Validates: Requirements 6.1**
    - Tag: `// Feature: subdomain-masker, Property 11: OPTIONS always returns CORS preflight response`
  - [ ] 8.3 Implement `handleHealthCheck(request: Request): Response` in `src/handlers/health.ts`
    - `GET /_health` → `200 {"status":"ok"}` with `Content-Type: application/json`
    - Any other method → `405 Method Not Allowed` with `Content-Type: text/plain; charset=UTF-8` and body `Method not allowed`
    - Security headers applied via `applySecurityHeaders`
    - _Requirements: 7.1, 7.2, 7.3_
  - [ ]\* 8.4 Write property test for `handleHealthCheck` — Property 12
    - **Property 12: Non-GET requests to /\_health return 405**
    - Generate HTTP methods other than `GET`; assert `405` with body `Method not allowed`
    - **Validates: Requirements 7.3**
    - Tag: `// Feature: subdomain-masker, Property 12: Non-GET requests to /_health return 405`

- [ ] 9. Implement proxy handler with redirect following and timeout
  - [ ] 9.1 Implement the full `handleProxy(request, targetUrl, subdomain)` in `src/handlers/proxy.ts`
    - Use `buildPassThroughRequest` to sanitise the request
    - Implement manual redirect following with `redirect: "manual"` up to `MAX_REDIRECTS = 5`; return `502 Too many redirects` if exceeded
    - Wrap the fetch in `Promise.race` with an `AbortController` timer of `UPSTREAM_TIMEOUT_MS = 30_000`; return `504 Upstream timed out` on abort, `502 Upstream connection failed` on network/DNS error
    - Apply `rewriteHtml` when status is 2xx and `Content-Type` includes `text/html`
    - Propagate 4xx/5xx upstream status codes and bodies verbatim
    - Strip `Server` and `X-Powered-By` from upstream headers
    - Emit `logRequest` on success; emit `logError` on all error paths
    - Apply `applySecurityHeaders` to all returned responses
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 4.2, 4.3, 5.1, 5.2, 5.3, 5.4, 5.5, 8.1, 8.2_
  - [ ]\* 9.2 Write property test for redirect limit — Property 4
    - **Property 4: Redirect limit enforcement**
    - Generate redirect chain lengths from 0 to 10; simulate with mock fetch; assert chains ≤ 5 resolve to final response, chains > 5 return `502 Too many redirects`
    - **Validates: Requirements 2.4, 5.4**
    - Tag: `// Feature: subdomain-masker, Property 4: Redirect limit enforcement`
  - [ ]\* 9.3 Write property test for upstream error propagation — Property 10
    - **Property 10: Upstream error status propagation**
    - Generate upstream status codes in `[400, 599]` excluding Worker-generated 502/504; assert Masked_Response carries same status and verbatim body
    - **Validates: Requirements 5.1**
    - Tag: `// Feature: subdomain-masker, Property 10: Upstream error status propagation`
  - [ ]\* 9.4 Write unit tests for proxy error paths
    - Test: network/DNS error → `502 Upstream connection failed`
    - Test: timeout (abort) → `504 Upstream timed out`
    - Test: generic unexpected error → `502 Upstream connection failed`
    - _Requirements: 5.2, 5.3, 5.5_

- [ ] 10. Checkpoint — Ensure all handler tests pass
  - Run `vitest --run` and confirm all handler-level tests pass.
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 11. Implement router and wire everything together
  - [ ] 11.1 Implement `route(request: Request, env: Env): Promise<Response>` in `src/router.ts`
    - Dispatch in priority order: OPTIONS → CORS; `/_health` → health check; resolve route map → if empty → 503; extract subdomain → if null or not in map → 404; otherwise → proxy handler
    - Emit `logError` for `misconfiguration` (503) and `unmatched_subdomain` (404) paths
    - _Requirements: 1.4, 3.1, 3.2, 3.3, 6.1, 8.2_
  - [ ]\* 11.2 Write property test for route map lookup — Property 2
    - **Property 2: Route Map lookup correctness**
    - Generate route maps with 1–100 entries; for a key present in the map, assert the Worker proxies to the mapped URL
    - **Validates: Requirements 1.2, 1.3, 2.1**
    - Tag: `// Feature: subdomain-masker, Property 2: Route Map lookup correctness`
  - [ ]\* 11.3 Write property test for unmatched subdomain — Property 6
    - **Property 6: Unmatched subdomain returns 404**
    - Generate route maps and subdomain strings not present as keys; assert `404 Not found`
    - **Validates: Requirements 3.1**
    - Tag: `// Feature: subdomain-masker, Property 6: Unmatched subdomain returns 404`
  - [ ] 11.4 Wire entry point in `src/index.ts`
    - Replace the stub with the real `fetch` handler that calls `route(request, env)` and records start time for duration logging
    - Ensure the worker exports `export default { fetch }` compatible with the Cloudflare Workers module format
    - _Requirements: 1.1, 2.1, 7.1, 8.1_
  - [ ]\* 11.5 Write unit tests for router edge cases
    - Test: empty route map → `503 Service misconfigured`
    - Test: `DEFAULT_ROUTE_MAP` entry `reward1` resolves to the correct Target_URL (not 404)
    - Test: apex domain → `404 Not found`
    - Test: GET `/_health` → `200 {"status":"ok"}` without upstream call
    - _Requirements: 1.4, 1.5, 3.2, 7.1, 7.2_

- [ ] 12. Final checkpoint — Ensure all tests pass
  - Run `vitest --run` and confirm the full test suite is green.
  - Ensure all tests pass, ask the user if questions arise.

---

## Notes

- Tasks marked with `*` are property-based tests. They are optional for a bare MVP but **strongly recommended** before production deployment — the properties they verify are core correctness guarantees of the system.
- Each task references specific requirements for traceability
- Property tests correspond 1-to-1 with numbered properties in the design's Correctness Properties section; each is tagged with the property number and the requirements it validates
- Unit tests cover the specific enumerated behaviors and error paths that don't vary meaningfully with arbitrary input
- Checkpoints at tasks 7 and 10 ensure the utility layer and handler layer are stable before wiring
- All responses — including errors, OPTIONS, and health check — receive `applySecurityHeaders` treatment per Requirement 4.1

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["2.1", "2.3"] },
    { "id": 1, "tasks": ["2.2", "2.4", "3.1"] },
    { "id": 2, "tasks": ["3.2", "4.1"] },
    { "id": 3, "tasks": ["4.2", "5.1"] },
    { "id": 4, "tasks": ["5.2", "5.3", "6.1"] },
    { "id": 5, "tasks": ["6.2", "6.3", "6.4", "8.1", "8.3"] },
    { "id": 6, "tasks": ["8.2", "8.4", "9.1"] },
    { "id": 7, "tasks": ["9.2", "9.3", "9.4"] },
    { "id": 8, "tasks": ["11.1"] },
    { "id": 9, "tasks": ["11.2", "11.3", "11.4"] },
    { "id": 10, "tasks": ["11.5"] }
  ]
}
```
