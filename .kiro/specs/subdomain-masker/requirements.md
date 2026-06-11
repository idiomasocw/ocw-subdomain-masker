# Requirements Document

## Introduction

This feature is a general-purpose Cloudflare Worker that performs subdomain masking (also known as transparent proxying or URL cloaking). It allows multiple subdomains (e.g. `reward1.one`, `reward2.one`) to display content fetched from external target URLs while keeping the visitor on the original subdomain in the browser address bar. The solution must be configuration-driven so that new subdomain-to-target mappings can be added without changing the core Worker logic. The first configured mapping is `reward1` → `https://view.genially.com/670ed038d21493d4843b3e5b`.

---

## Glossary

- **Worker**: The Cloudflare Worker script that handles all incoming HTTP requests.
- **Subdomain**: The leftmost label of the incoming request's hostname (e.g. `reward1` in `reward1.one`).
- **Target_URL**: The external URL that a Subdomain is mapped to in the Route_Map.
- **Route_Map**: The configuration object that maps Subdomain strings to Target_URLs. The authoritative source is the Worker's environment configuration (e.g. a Cloudflare KV binding or `wrangler.toml` vars); a top-level constant in the Worker source file serves as the fallback when environment configuration is absent.
- **Masked_Response**: The HTTP response returned to the client, whose body is fetched from the Target_URL but served under the original Subdomain's origin.
- **Upstream**: The external server identified by the Target_URL that provides the content to be proxied.
- **Security_Headers**: A fixed set of HTTP response headers set on every response to enforce safe browser behaviour (e.g. `X-Frame-Options`, `X-Content-Type-Options`, `Content-Security-Policy`).
- **Pass-Through_Request**: A request forwarded to the Upstream with only the headers necessary for transparent proxying (no internal or identifying Cloudflare headers).

---

## Requirements

### Requirement 1: Route Map Configuration

**User Story:** As a developer, I want to define subdomain-to-target mappings in a single configuration object, so that I can add or update routes without modifying the Worker's core logic.

#### Acceptance Criteria

1. THE Worker SHALL read all Subdomain-to-Target_URL mappings from the Route_Map, where the authoritative source is the Worker's environment configuration (e.g. Cloudflare KV or `wrangler.toml` vars); IF environment configuration is absent or empty, THE Worker SHALL fall back to a top-level constant defined in the Worker source file.
2. THE Route_Map SHALL support up to 100 Subdomain keys, each mapped to exactly one Target_URL string.
3. WHEN a new Subdomain entry is added to the Route_Map, THE Worker SHALL proxy requests for that Subdomain without any changes to the core Worker routing logic.
4. IF the Route_Map has no entries in either the environment configuration nor the source-file constant, THEN THE Worker SHALL return an HTTP `503 Service Unavailable` response with a `Content-Type: text/plain; charset=UTF-8` header and a plain-text body of `Service misconfigured` for all requests **except** those handled by earlier-priority rules (OPTIONS → CORS, `/_health` → health check); those routes take precedence over the 503 path regardless of Route_Map state.
5. THE Worker SHALL include a pre-configured Route_Map entry mapping the Subdomain `reward1` to the Target_URL `https://view.genially.com/670ed038d21493d4843b3e5b`; this pre-configured entry counts as a valid Route_Map entry and SHALL prevent the `503 Service Unavailable` response defined in criterion 4.

---

### Requirement 2: Transparent Subdomain Proxying

**User Story:** As a visitor, I want the content of an external page to appear under the subdomain URL, so that the original external URL is never exposed in my browser's address bar.

#### Acceptance Criteria

1. WHEN a request arrives for a Subdomain present in the Route_Map, THE Worker SHALL fetch the content from the corresponding Target_URL and return it as the Masked_Response to the client.
2. WHEN constructing the Pass-Through_Request to the Upstream, THE Worker SHALL preserve the original request method, request headers (excluding `Host` and any `CF-*` prefixed headers), and request body.
3. WHEN constructing the Pass-Through_Request to the Upstream, THE Worker SHALL set the `Host` header to the hostname of the Target_URL.
4. IF the Upstream issues more than 5 consecutive HTTP redirects, THEN THE Worker SHALL stop following redirects and return an HTTP `502 Bad Gateway` response with a `Content-Type: text/plain; charset=UTF-8` header and a plain-text body of `Too many redirects`.
5. WHEN the Upstream responds with a `Content-Type` of `text/html` and the response is a successful (2xx) proxy response, THE Worker SHALL rewrite all absolute URLs within the HTML body that reference the Upstream's origin — in `href`, `src`, `action`, and `srcset` attributes — to root-relative paths (e.g. `https://view.genially.com/foo` → `/foo`), so that subsequent asset requests remain on the masked Subdomain.

---

### Requirement 3: Unmatched Subdomain Handling

**User Story:** As a site operator, I want requests to unknown or unmapped subdomains to receive a clear error response, so that visitors are not silently served incorrect content.

#### Acceptance Criteria

1. WHEN a request arrives for a Subdomain that is NOT present in the Route_Map, THE Worker SHALL return an HTTP `404 Not Found` response with a `Content-Type: text/plain; charset=UTF-8` header and a plain-text body of `Not found`.
2. WHEN a request arrives at the apex domain — defined as a hostname with no dot-delimited label preceding the registered domain (e.g. `one` or `example.com`); note that `www` is treated as a Subdomain and does not qualify as the apex — THE Worker SHALL return an HTTP `404 Not Found` response with a `Content-Type: text/plain; charset=UTF-8` header and a plain-text body of `Not found`.
3. IF the Route_Map is empty or undefined at Worker initialisation, THEN THE Worker SHALL return an HTTP `503 Service Unavailable` response with a `Content-Type: text/plain; charset=UTF-8` header and a plain-text body of `Service misconfigured` for all requests.

---

### Requirement 4: Security Headers

**User Story:** As a security engineer, I want all proxied responses to include protective HTTP headers, so that the Worker does not introduce cross-site scripting or clickjacking vulnerabilities.

#### Acceptance Criteria

1. THE Worker SHALL set the following Security_Headers on every response it returns to the client — including proxied, error, health check, and OPTIONS responses — overwriting any value already present for each header:
   - `X-Content-Type-Options: nosniff`
   - `X-Frame-Options: SAMEORIGIN`
   - `Referrer-Policy: no-referrer`
   - `Content-Security-Policy: default-src 'self' https:; img-src 'self' https: data:; style-src 'self' https: 'unsafe-inline'; script-src 'self' https: 'unsafe-inline'`
2. THE Worker SHALL remove the `Server` response header from every Masked_Response before returning it to the client.
3. THE Worker SHALL remove the `X-Powered-By` response header from every Masked_Response before returning it to the client.

---

### Requirement 5: Upstream Error Propagation

**User Story:** As a developer, I want the Worker to faithfully surface Upstream errors to the client, so that I can diagnose problems with specific Target_URLs.

#### Acceptance Criteria

1. WHEN the Upstream returns an HTTP status code of 4xx or 5xx (excluding Worker-generated 502/504 errors defined in criteria 2, 3, and 4), THE Worker SHALL return a Masked_Response with that same status code and forward the Upstream's original response body verbatim as the response body.
2. IF the Worker cannot establish a connection to the Upstream due to a network error or DNS failure, THEN THE Worker SHALL return an HTTP `502 Bad Gateway` response with a `Content-Type: text/plain; charset=UTF-8` header and a plain-text body of `Upstream connection failed`.
3. IF the Upstream does not respond within 30 seconds, THEN THE Worker SHALL return an HTTP `504 Gateway Timeout` response with a `Content-Type: text/plain; charset=UTF-8` header and a plain-text body of `Upstream timed out`.
4. IF the redirect limit defined in Requirement 2 criterion 4 is exceeded, THEN THE Worker SHALL return an HTTP `502 Bad Gateway` response with a `Content-Type: text/plain; charset=UTF-8` header and a plain-text body of `Too many redirects`.
5. IF any upstream error occurs that is not covered by criteria 2, 3, or 4 above (including but not limited to unexpected protocol errors or partial response failures), THEN THE Worker SHALL return an HTTP `502 Bad Gateway` response with a `Content-Type: text/plain; charset=UTF-8` header and a plain-text body of `Upstream connection failed`.

---

### Requirement 6: Request Method and CORS Support

**User Story:** As a web developer, I want the Worker to handle preflight CORS requests correctly, so that browser-based clients can load proxied content without cross-origin errors.

#### Acceptance Criteria

1. WHEN a request is received with the `OPTIONS` method, THE Worker SHALL immediately return an HTTP `204 No Content` response — short-circuiting all other routing, logging, and security checks regardless of Subdomain mapping or path — with the following headers:
   - `Access-Control-Allow-Origin: *`
   - `Access-Control-Allow-Methods: GET, POST, HEAD, OPTIONS`
   - `Access-Control-Allow-Headers: Content-Type, Authorization`
   - `Access-Control-Max-Age: 86400`
2. WHEN any non-OPTIONS response is returned — including proxied, error, and health check responses — THE Worker SHALL include the `Access-Control-Allow-Origin: *` header.

---

### Requirement 7: Health Check Endpoint

**User Story:** As an operator, I want a dedicated health check endpoint, so that I can verify the Worker is running without depending on any specific proxied Subdomain.

#### Acceptance Criteria

1. WHEN a GET request is received at the path `/_health` on any hostname, THE Worker SHALL return an HTTP `200 OK` response with a `Content-Type: application/json` header and a JSON body of `{"status":"ok"}`.
2. THE health check response SHALL NOT be proxied to any Upstream; THE Worker SHALL generate it directly.
3. WHEN a non-GET request (e.g. POST, PUT, DELETE) is received at the path `/_health`, THE Worker SHALL return an HTTP `405 Method Not Allowed` response with a `Content-Type: text/plain; charset=UTF-8` header and a plain-text body of `Method not allowed`.

---

### Requirement 8: Logging and Observability

**User Story:** As a developer, I want the Worker to emit structured log entries for each proxied request, so that I can monitor traffic and debug issues using Cloudflare's logging tools.

#### Acceptance Criteria

1. WHEN a request is proxied, THE Worker SHALL emit a JSON-formatted log entry via `console.log` containing: the incoming Subdomain, the Target_URL, the HTTP method, the response status code, and the request duration in milliseconds (with decimal precision to capture sub-millisecond durations) measured from the moment the Worker receives the request to the moment the response is returned to the client.
2. WHEN an error occurs (upstream failure, timeout, or misconfiguration), THE Worker SHALL emit a JSON-formatted log entry via `console.error` containing: an `errorType` field with one of the values `upstream_failure`, `timeout`, `misconfiguration`, or `unmatched_subdomain`; and a `message` field identifying the affected Subdomain and the reason for the failure.
3. THE Worker SHALL NOT include the request URL path, query string, request headers, or any other potentially sensitive request data in any log entry.
