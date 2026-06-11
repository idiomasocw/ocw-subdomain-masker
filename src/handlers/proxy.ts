import { MAX_REDIRECTS, UPSTREAM_TIMEOUT_MS, HEADERS_TO_REMOVE } from "../constants";
import { rewriteHtml } from "../htmlRewriter";
import { applySecurityHeaders } from "../securityHeaders";
import { logRequest, logError } from "../logger";

export function buildPassThroughRequest(
  original: Request,
  targetUrl: string,
  method: string,
  body: BodyInit | null,
): Request {
  const headers = new Headers();
  for (const [key, value] of original.headers) {
    const lower = key.toLowerCase();
    if (lower === "host" || lower.startsWith("cf-")) continue;
    headers.set(key, value);
  }
  headers.set("Host", new URL(targetUrl).hostname);
  return new Request(targetUrl, { method, headers, body, redirect: "manual" });
}

function plainError(status: number, body: string): Response {
  return new Response(body, {
    status,
    headers: { "Content-Type": "text/plain; charset=UTF-8" },
  });
}

export async function handleProxy(
  request: Request,
  targetUrl: string,
  subdomain: string,
  startTime: number,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);

  let upstreamResponse: Response;
  let currentUrl = targetUrl;
  let method = request.method;
  // Body can only be consumed once; buffer it only when needed for redirect replay
  let body: BodyInit | null = request.body;
  let redirectCount = 0;

  try {
    while (true) {
      const passThrough = buildPassThroughRequest(request, currentUrl, method, body);
      upstreamResponse = await fetch(currentUrl, {
        method: passThrough.method,
        headers: passThrough.headers,
        body: passThrough.body,
        redirect: "manual",
        signal: controller.signal,
      });

      const { status } = upstreamResponse;

      if (status >= 300 && status < 400) {
        redirectCount++;
        if (redirectCount > MAX_REDIRECTS) {
          logError({
            errorType: "upstream_failure",
            subdomain,
            message: `Too many redirects fetching ${targetUrl}`,
          });
          return applySecurityHeaders(plainError(502, "Too many redirects"));
        }
        const location = upstreamResponse.headers.get("Location");
        if (!location) break; // malformed redirect — treat as final response
        currentUrl = new URL(location, currentUrl).href;
        // Standard redirect method collapsing
        if (status === 303 || ((status === 301 || status === 302) && method === "POST")) {
          method = "GET";
          body = null;
        }
        continue;
      }

      break;
    }
  } catch (err) {
    clearTimeout(timer);
    if (err instanceof DOMException && err.name === "AbortError") {
      logError({ errorType: "timeout", subdomain, message: `Upstream timed out: ${targetUrl}` });
      return applySecurityHeaders(plainError(504, "Upstream timed out"));
    }
    logError({
      errorType: "upstream_failure",
      subdomain,
      message: `Upstream connection failed: ${targetUrl}`,
    });
    return applySecurityHeaders(plainError(502, "Upstream connection failed"));
  } finally {
    clearTimeout(timer);
  }

  const { status } = upstreamResponse!;
  const durationMs = performance.now() - startTime;

  // Strip identifying upstream headers
  const responseHeaders = new Headers(upstreamResponse!.headers);
  for (const name of HEADERS_TO_REMOVE) {
    responseHeaders.delete(name);
  }

  let response = new Response(upstreamResponse!.body, {
    status,
    statusText: upstreamResponse!.statusText,
    headers: responseHeaders,
  });

  // Rewrite absolute upstream URLs in HTML responses
  const contentType = response.headers.get("Content-Type") ?? "";
  if (status >= 200 && status < 300 && contentType.includes("text/html")) {
    const upstreamOrigin = new URL(targetUrl).origin;
    response = rewriteHtml(response, upstreamOrigin);
  }

  logRequest({ subdomain, targetUrl, method: request.method, status, durationMs });

  return applySecurityHeaders(response);
}
