# Implementation Plan: subdomain-masker

## Overview

Implement a Cloudflare Worker in TypeScript that performs transparent subdomain proxying. The implementation proceeds bottom-up: types and constants first, then pure utility functions (subdomain extractor, route map resolver, request sanitiser, HTML rewriter, security headers applier, logger), then the handler layer (CORS, health check, proxy), and finally the top-level router and entry point. Property-based tests (fast-check) and unit tests (Vitest + `@cloudflare/vitest-pool-workers`) are added alongside each component.

---

## Tasks

- [x] 1. Scaffold project structure, types, and constants
  - Create `package.json` — pnpm@11.2.2, scripts: `dev`, `deploy`, `test`, `test:watch`; devDependencies: `wrangler@^3.99`, `typescript@^5.5`, `@cloudflare/workers-types@^4`, `@cloudflare/vitest-pool-workers@^0.5`, `vitest@^2.1`, `fast-check@^3.22`
  - Create `wrangler.toml` — `name`, `main = "src/index.ts"`, `compatibility_date = "2024-11-01"`, `compatibility_flags = ["nodejs_compat"]`; commented `ROUTE_MAP` example; commented `[[routes]]` for `*.onecultureworld.com/*`
  - Create `tsconfig.json` — strict ES2022 module worker config with `@cloudflare/workers-types`
  - Create `.gitignore` — `node_modules/`, `dist/`, `.wrangler/`, `.dev.vars`, `package-lock.json`
  - Create `.npmrc` — `node-linker=hoisted` for `@cloudflare/vitest-pool-workers` compatibility
  - Create `pnpm-workspace.yaml` — `allowBuilds: esbuild, sharp, workerd`
  - Create `vitest.config.ts` — `defineWorkersConfig` pointing at `./wrangler.toml`
  - Create `src/types.ts`, `src/constants.ts`, `src/index.ts` stub
  - _Requirements: 1.1, 1.5, 2.4, 4.1, 6.1_

- [x] 2. Implement `extractSubdomain` and `resolveRouteMap`
  - [x] 2.1 Implement `extractSubdomain(hostname: string): string | null` in `src/subdomain.ts`
  - [x] 2.2 Property test — Property 7: Apex domain returns 404 (`test/subdomain.test.ts`)
  - [x] 2.3 Implement `resolveRouteMap(env: Env): RouteMap` in `src/routeMap.ts`
  - [x] 2.4 Property test — Property 1: Route Map resolution precedence (`test/routeMap.test.ts`)

- [x] 3. Implement Pass-Through Request construction
  - [x] 3.1 `buildPassThroughRequest` implemented (exported from `src/handlers/proxy.ts`)
  - [x] 3.2 Property test — Property 3: Pass-Through Request construction (`test/proxy.test.ts`, 200 iterations)

- [x] 4. Implement HTML rewriter
  - [x] 4.1 `rewriteHtml(response, upstreamOrigin)` in `src/htmlRewriter.ts` — handles `href`, `src`, `action`, and `srcset` (with proper comma-separated descriptor parsing per the design caveat)
  - [x] 4.2 Property test — Property 5: HTML Upstream URL rewriting (`test/htmlRewriter.test.ts`, 200 iterations)

- [x] 5. Implement security headers applier
  - [x] 5.1 `applySecurityHeaders(response)` in `src/securityHeaders.ts`
  - [x] 5.2 Property test — Property 8: Security headers always applied (`test/securityHeaders.test.ts`)
  - [x] 5.3 Property test — Property 9: Identifying headers stripped (`test/securityHeaders.test.ts`)

- [x] 6. Implement logger
  - [x] 6.1 `logRequest` and `logError` in `src/logger.ts`
  - [x] 6.2 Property test — Property 13: Proxy request log fields (`test/logger.test.ts`, 200 iterations)
  - [x] 6.3 Property test — Property 14: Error log fields (`test/logger.test.ts`)
  - [x] 6.4 Property test — Property 15: No sensitive data in logs (`test/logger.test.ts`)

- [x] 7. Checkpoint — All utility-layer tests pass ✓ (29/29 at this stage)

- [x] 8. Implement CORS and health check handlers
  - [x] 8.1 `handleCors()` in `src/handlers/cors.ts`
  - [x] 8.2 Property test — Property 11: OPTIONS always returns CORS preflight (`test/router.test.ts`)
  - [x] 8.3 `handleHealthCheck(request)` in `src/handlers/health.ts`
  - [x] 8.4 Property test — Property 12: Non-GET to `/_health` returns 405 (`test/router.test.ts`)

- [x] 9. Implement proxy handler with redirect following and timeout
  - [x] 9.1 `handleProxy(request, targetUrl, subdomain, startTime)` in `src/handlers/proxy.ts`
    - Manual redirect loop up to `MAX_REDIRECTS = 5`; 30 s `AbortController` timeout
    - HTML rewriting, header stripping, upstream error propagation, structured logging
  - [x] 9.2 Property test — Property 4: Redirect limit enforcement (`test/proxy.test.ts`, `it.each` 0–10 hops)
  - [x] 9.3 Property test — Property 10: Upstream error propagation (`test/proxy.test.ts`)
  - [x] 9.4 Unit tests — network error → 502, timeout → 504, unexpected error → 502 (`test/proxy.test.ts`)

- [x] 10. Checkpoint — All handler tests pass ✓

- [x] 11. Implement router and wire everything together
  - [x] 11.1 `route(request, env, startTime)` in `src/router.ts` — OPTIONS → CORS → health → route map → proxy/404/503
  - [x] 11.2 Property test — Property 2: Route Map lookup correctness (`test/router.test.ts`)
  - [x] 11.3 Property test — Property 6: Unmatched subdomain returns 404 (`test/router.test.ts`)
  - [x] 11.4 Entry point wired in `src/index.ts` — records `startTime`, delegates to `route()`
  - [x] 11.5 Unit tests — apex domain → 404, `ROUTE_MAP='{}'` falls back to `DEFAULT_ROUTE_MAP`, `/_health` bypasses route map, `reward1` proxies correctly (`test/router.test.ts`)

- [x] 12. Final checkpoint — **76 / 76 tests passing** across 7 test files; all 15 design properties (P1–P15) exercised ✓

- [ ] 13. CI/CD and deployment
  - [x] 13.1 Create `.github/workflows/deploy.yml` — `test` job only (runs tests on every push/PR); deployment handled by Cloudflare's native GitHub integration
  - [ ] 13.2 Push the repo to GitHub
  - [ ] 13.3 In Cloudflare dashboard → Workers & Pages → "Connect GitHub" → select this repo; Cloudflare handles auth and auto-deploys on push to `main`
  - [ ] 13.4 In the Cloudflare dashboard → Workers & Pages → `ocw-subdomain-masker` → Settings → Triggers → add route `*.onecultureworld.com/*` with zone `onecultureworld.com`
  - [ ] 13.5 (Optional) Set `ROUTE_MAP` environment variable in Workers Settings to add/update subdomains without redeploying

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
    { "id": 10, "tasks": ["11.5"] },
    { "id": 11, "tasks": ["13"] }
  ]
}
```
