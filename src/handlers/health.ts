import { applySecurityHeaders } from "../securityHeaders";

export function handleHealthCheck(request: Request): Response {
  if (request.method !== "GET") {
    return applySecurityHeaders(
      new Response("Method not allowed", {
        status: 405,
        headers: { "Content-Type": "text/plain; charset=UTF-8" },
      }),
    );
  }
  return applySecurityHeaders(
    new Response('{"status":"ok"}', {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }),
  );
}
