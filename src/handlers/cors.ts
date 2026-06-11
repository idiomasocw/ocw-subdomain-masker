import { CORS_HEADERS } from "../constants";
import { applySecurityHeaders } from "../securityHeaders";

export function handleCors(): Response {
  return applySecurityHeaders(
    new Response(null, { status: 204, headers: CORS_HEADERS }),
  );
}
