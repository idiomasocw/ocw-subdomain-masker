import type { Env } from "./types";
import { resolveRouteMap } from "./routeMap";
import { extractSubdomain } from "./subdomain";
import { applySecurityHeaders } from "./securityHeaders";
import { logError } from "./logger";
import { handleCors } from "./handlers/cors";
import { handleHealthCheck } from "./handlers/health";
import { handleProxy } from "./handlers/proxy";

function plainError(status: number, body: string): Response {
  return applySecurityHeaders(
    new Response(body, {
      status,
      headers: { "Content-Type": "text/plain; charset=UTF-8" },
    }),
  );
}

export async function route(
  request: Request,
  env: Env,
  startTime: number,
): Promise<Response> {
  // 1. CORS preflight — short-circuits everything
  if (request.method === "OPTIONS") {
    return handleCors();
  }

  const url = new URL(request.url);

  // 2. Health check — works regardless of route map state
  if (url.pathname === "/_health") {
    return handleHealthCheck(request);
  }

  // 3. Resolve route map
  const routeMap = resolveRouteMap(env);
  if (Object.keys(routeMap).length === 0) {
    logError({
      errorType: "misconfiguration",
      subdomain: url.hostname,
      message: "Route map is empty",
    });
    return plainError(503, "Service misconfigured");
  }

  // 4. Extract subdomain
  const subdomain = extractSubdomain(url.hostname);
  if (!subdomain) {
    logError({
      errorType: "unmatched_subdomain",
      subdomain: url.hostname,
      message: `Apex domain or no subdomain: ${url.hostname}`,
    });
    return plainError(404, "Not found");
  }

  // 5. Look up in route map
  const targetUrl = routeMap[subdomain];
  if (!targetUrl) {
    logError({
      errorType: "unmatched_subdomain",
      subdomain,
      message: `Subdomain not in route map: ${subdomain}`,
    });
    return plainError(404, "Not found");
  }

  // 6. Proxy
  return handleProxy(request, targetUrl, subdomain, startTime);
}
